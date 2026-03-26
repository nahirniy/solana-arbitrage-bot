import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { Metadata } from "@grpc/grpc-js";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import path from "path";

type FeeServiceClient = grpc.Client & {
	GetTransactionFee: (
		request: unknown,
		metadata: grpc.Metadata,
		callback: (err: unknown, response: unknown) => void
	) => void;
};

interface FeeResponse {
	priorityFee?: { value: number };
	tip?: { value: number };
}

export interface BlockRazorFeeData {
	readonly computeUnitPriceBase: number;
	readonly baseMarketTip: number;
	readonly computeUnitPriceMax: number;
	readonly maxMarketTip: number;
}

const FEE_PROTO_PATH = path.resolve(__dirname, "protos", "blockRazorFeeSolana.proto");
const CLIENT_READY_TIMEOUT_MS = 5000;
const DEFAULT_SLOT_RANGE = 50;
const DEFAULT_PERCENTILE_BASE = 95;
const DEFAULT_PERCENTILE_MAX = 99;

export class BlockRazorFeeService {
	private client: FeeServiceClient | null = null;
	private metadata: Metadata | null = null;

	constructor(
		private readonly grpcEndpoint: string,
		private readonly apiToken: string
	) {}

	async getFeeData(contendedAccounts: string[]): Promise<BlockRazorFeeData> {
		const { client, metadata } = await this.getClient();

		const baseRes = await this.fetchFee(client, metadata, contendedAccounts, DEFAULT_PERCENTILE_BASE);
		const maxRes = await this.fetchFee(client, metadata, contendedAccounts, DEFAULT_PERCENTILE_MAX);

		return {
			computeUnitPriceBase: baseRes.priorityFee,
			baseMarketTip: baseRes.marketTip,
			computeUnitPriceMax: maxRes.priorityFee,
			maxMarketTip: maxRes.marketTip
		};
	}

	async warmUp(): Promise<void> {
		await this.getClient();
	}

	private fetchFee(
		client: FeeServiceClient,
		metadata: Metadata,
		accounts: string[],
		percentile: number
	): Promise<{ priorityFee: number; marketTip: number }> {
		return new Promise((resolve, reject) => {
			client.GetTransactionFee(
				{ accounts, percentile, slotRange: DEFAULT_SLOT_RANGE },
				metadata,
				(err: unknown, response: unknown) => {
					if (err) return reject(new Error(`BlockRazor fee P${percentile}: ${(err as Error).message}`));

					const res = response as FeeResponse;
					if (!res?.priorityFee || !res?.tip) {
						return reject(new Error(`BlockRazor fee P${percentile}: invalid response`));
					}

					resolve({
						priorityFee: Math.round(res.priorityFee.value),
						marketTip: Math.round(res.tip.value * LAMPORTS_PER_SOL)
					});
				}
			);
		});
	}

	private async getClient(): Promise<{ client: FeeServiceClient; metadata: Metadata }> {
		if (this.client && this.metadata) return { client: this.client, metadata: this.metadata };

		const proto = protoLoader.loadSync(FEE_PROTO_PATH, {
			includeDirs: [path.dirname(FEE_PROTO_PATH)],
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true
		});

		const loaded = grpc.loadPackageDefinition(proto) as Record<string, unknown>;
		const ServiceConstructor = (loaded.feepb as Record<string, unknown>)?.Server as typeof grpc.Client;
		if (!ServiceConstructor) throw new Error("BlockRazor fee: feepb.Server not found in proto");

		const client = new ServiceConstructor(this.grpcEndpoint, grpc.credentials.createSsl(), {
			"grpc.keepalive_time_ms": 40000,
			"grpc.keepalive_timeout_ms": 10000,
			"grpc.keepalive_permit_without_calls": 1
		}) as FeeServiceClient;

		await new Promise<void>((resolve, reject) => {
			client.waitForReady(Date.now() + CLIENT_READY_TIMEOUT_MS, (err?: Error) => {
				if (err) reject(new Error(`BlockRazor fee connect timeout: ${err.message}`));
				else resolve();
			});
		});

		const metadata = new Metadata();
		metadata.set("apiKey", this.apiToken);
		this.client = client;
		this.metadata = metadata;

		return { client, metadata };
	}
}
