import {
	AddressLookupTableAccount,
	Connection,
	Keypair,
	SystemProgram,
	TransactionInstruction,
	TransactionMessage,
	VersionedTransaction
} from "@solana/web3.js";
import { RelayName } from "../types";
import type { RelayHandler, RelayResult, SendParams } from "../types";
import type { RelayKeys } from "../config/env";
import { HeliusJitoRelay, AstralaneRelay, StelliumRelay, Slot0Relay, CorvusFalconRelay, BlockRazorRelay } from "./relays";
import { getRandomTipAccount } from "./tip-accounts";
import { log, formatError } from "../utils";

const TX_SIZE_LIMIT = 1232;
const CONFIRM_POLL_MS = 800;
const CONFIRM_TIMEOUT_MS = 30_000;

export class SenderService {
	private relays: RelayHandler[] = [];
	private connection: Connection | null = null;

	init(keys: RelayKeys, connection: Connection): void {
		this.connection = connection;
		if (keys.heliusRpcUrl) this.addRelay(new HeliusJitoRelay(keys.heliusRpcUrl));
		if (keys.astralaneApiKey) this.addRelay(new AstralaneRelay(keys.astralaneApiKey, keys.astralaneRpcUrl ?? undefined));
		if (keys.stelliumApiKey) this.addRelay(new StelliumRelay(keys.stelliumApiKey, keys.stelliumRpcUrl ?? undefined));
		if (keys.slot0ApiKey) this.addRelay(new Slot0Relay(keys.slot0ApiKey, keys.slot0RpcUrl ?? undefined));
		if (keys.corvusFalconApiKey) this.addRelay(new CorvusFalconRelay(keys.corvusFalconApiKey, keys.corvusFalconRpcUrl ?? undefined));
		if (keys.blockRazorGrpc && keys.blockRazorToken) this.addRelay(new BlockRazorRelay(keys.blockRazorGrpc, keys.blockRazorToken));
	}

	addRelay(relay: RelayHandler): void {
		this.relays.push(relay);
		log.info(`[sender] Relay added: ${relay.name}`);
	}

	async send(params: SendParams): Promise<RelayResult[]> {
		const { instructions, wallet, nonce, tipLamports, luts } = params;

		if (this.relays.length === 0) throw new Error("[sender] No relays configured");

		const promises = this.relays.map(async (relay) => {
			try {
				const base64Tx = this.buildSignedTx(instructions, wallet, nonce, tipLamports, relay.name, luts);
				const hash = await relay.send(base64Tx);
				return { hash, relay: relay.name } as RelayResult;
			} catch (err) {
				log.error(`[sender] ${relay.name} failed: ${formatError(err)}`);
				return null;
			}
		});

		const results = await Promise.all(promises);
		const successful = results.filter((r): r is RelayResult => r !== null);

		if (successful.length === 0) throw new Error("[sender] All relays failed");

		log.success(`[sender] TX sent via ${successful.length}/${this.relays.length} relays`);
		return successful;
	}

	async awaitConfirmation(candidates: RelayResult[]): Promise<RelayResult | null> {
		if (!this.connection) throw new Error("[sender] Connection not initialized");

		const signatures = candidates.map((c) => c.hash);
		const start = Date.now();

		while (Date.now() - start < CONFIRM_TIMEOUT_MS) {
			const { value: statuses } = await this.connection.getSignatureStatuses(signatures, {
				searchTransactionHistory: false
			});

			for (let i = 0; i < statuses.length; i++) {
				const status = statuses[i];
				if (!status) continue;

				if (status.err) {
					log.error(`[sender] TX failed via ${candidates[i].relay}: ${JSON.stringify(status.err)}`);
					return candidates[i];
				}

				if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
					return candidates[i];
				}
			}

			await new Promise((r) => setTimeout(r, CONFIRM_POLL_MS));
		}

		log.error(`[sender] TX confirmation timeout (${CONFIRM_TIMEOUT_MS / 1000}s)`);
		return null;
	}

	private buildSignedTx(
		instructions: TransactionInstruction[],
		wallet: Keypair,
		nonce: string,
		tipLamports: number,
		relay: RelayName,
		luts?: AddressLookupTableAccount[]
	): string {
		const finalInstructions = [...instructions];

		if (tipLamports > 0) {
			finalInstructions.push(
				SystemProgram.transfer({
					fromPubkey: wallet.publicKey,
					toPubkey: getRandomTipAccount(relay),
					lamports: tipLamports
				})
			);
		}

		const message = new TransactionMessage({
			payerKey: wallet.publicKey,
			recentBlockhash: nonce,
			instructions: finalInstructions
		}).compileToV0Message(luts);

		const tx = new VersionedTransaction(message);
		tx.sign([wallet]);
		const serialized = tx.serialize();

		if (serialized.length > TX_SIZE_LIMIT) {
			log.warning(`[sender] TX size ${serialized.length} bytes (limit ${TX_SIZE_LIMIT})`);
		}

		return Buffer.from(serialized).toString("base64");
	}
}
