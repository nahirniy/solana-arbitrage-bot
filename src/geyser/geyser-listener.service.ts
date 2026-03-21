import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { ClientDuplexStream } from "@grpc/grpc-js";
import bs58 from "bs58";
import { RECONNECT_DELAY_MS, STALE_STREAM_TIMEOUT_MS } from "../config";
import { PoolStateService } from "../state";
import { ArbDetectorService } from "../arb/arb-detector.service";
import { log, formatError } from "../utils";

export class GeyserListenerService {
	private client: Client | null = null;
	private stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate> | null = null;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private staleTimer: NodeJS.Timeout | null = null;

	constructor(
		private readonly geyserUrl: string,
		private readonly poolState: PoolStateService,
		private readonly arbDetector: ArbDetectorService
	) {}

	async start(): Promise<void> {
		this.client = new Client(this.geyserUrl, undefined, {
			"grpc.max_receive_message_length": 64 * 1024 * 1024,
			"grpc.max_send_message_length": 64 * 1024 * 1024
		});

		await this.subscribe();
	}

	async stop(): Promise<void> {
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		if (this.staleTimer) clearTimeout(this.staleTimer);
		this.cleanupStream();
	}

	private async subscribe(): Promise<void> {
		if (!this.client) return;
		this.cleanupStream();

		try {
			this.stream = await this.client.subscribe();

			const accounts = this.poolState.getAllSubscriptionAddresses();
			const request: SubscribeRequest = {
				accounts: {
					pools: { account: accounts, owner: [], filters: [] }
				},
				// slot updates arrive every ~400ms regardless of swaps,
				// so we going to reconnect if no data for 30s (TIMEOUT)
				slots: { slots: {} },
				commitment: CommitmentLevel.PROCESSED,
				transactions: {},
				transactionsStatus: {},
				blocks: {},
				blocksMeta: {},
				entry: {},
				accountsDataSlice: []
			};

			await new Promise<void>((resolve, reject) => {
				this.stream!.write(request, (err: unknown) => (err ? reject(err) : resolve()));
			});

			log.success(`[geyser] Subscribed to ${accounts.length} accounts`);
			this.resetStaleTimer();

			this.stream.on("data", (update: SubscribeUpdate) => {
				this.resetStaleTimer();

				if (!update.account?.account) return;

				const pubkey = bs58.encode(Buffer.from(update.account.account.pubkey));
				const data = Buffer.from(update.account.account.data);
				const slot = Number(update.account.slot);

				const changed = this.poolState.handleUpdate(pubkey, data);
				if (changed) this.arbDetector.scan(slot);
			});

			this.stream.on("error", (err: Error) => {
				log.error(`[geyser] Stream error: ${err.message}`);
				this.scheduleReconnect();
			});

			this.stream.on("end", () => {
				log.warning("[geyser] Stream ended");
				this.scheduleReconnect();
			});
		} catch (err) {
			log.error(`[geyser] Connection failed: ${formatError(err)}`);
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) return;

		log.warning(`[geyser] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s`);
		this.reconnectTimer = setTimeout(async () => {
			this.reconnectTimer = null;
			await this.subscribe();
		}, RECONNECT_DELAY_MS);
	}

	private resetStaleTimer(): void {
		if (this.staleTimer) clearTimeout(this.staleTimer);
		this.staleTimer = setTimeout(() => {
			log.error("[geyser] No data for 30s — stream stale");
			this.scheduleReconnect();
		}, STALE_STREAM_TIMEOUT_MS);
	}

	private cleanupStream(): void {
		if (this.staleTimer) {
			clearTimeout(this.staleTimer);
			this.staleTimer = null;
		}
		if (this.stream) {
			try {
				this.stream.removeAllListeners();
				this.stream.cancel();
				this.stream.destroy();
			} catch {
				// already closed
			}
			this.stream = null;
		}
	}
}
