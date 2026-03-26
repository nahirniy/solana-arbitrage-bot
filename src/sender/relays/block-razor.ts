import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { Metadata } from "@grpc/grpc-js";
import path from "path";
import { RelayName } from "../../types";
import type { RelayHandler } from "../../types";


type SendServiceClient = grpc.Client & {
	SendTransaction: (request: unknown, metadata: grpc.Metadata, callback: (err: unknown, response: unknown) => void) => void;
	GetHealth: (request: unknown, metadata: grpc.Metadata, callback: (err: unknown, response: unknown) => void) => void;
};

const PROTO_PATH = path.resolve(__dirname, "protos", "blockRazorSendTxSolana.proto");
const CLIENT_READY_TIMEOUT_MS = 5000;

export class BlockRazorRelay implements RelayHandler {
	readonly name = RelayName.BLOCK_RAZOR;
	private client: SendServiceClient | null = null;
	private metadata: Metadata | null = null;

	constructor(
		private readonly grpcEndpoint: string,
		private readonly apiToken: string
	) {}

	async send(base64Tx: string): Promise<string> {
		const { client, metadata } = await this.getClient();

		return new Promise((resolve, reject) => {
			client.SendTransaction(
				{ transaction: base64Tx, mode: "fast", safeWindow: 5, revertProtection: false },
				metadata,
				(err: unknown, response: unknown) => {
					if (err) return reject(new Error(`BlockRazor gRPC: ${(err as Error).message}`));
					const sig = (response as { signature?: string })?.signature;
					if (!sig) return reject(new Error("BlockRazor: no signature in response"));
					resolve(sig);
				}
			);
		});
	}

	async warmUp(): Promise<void> {
		await this.getClient();
	}

	private async getClient(): Promise<{ client: SendServiceClient; metadata: Metadata }> {
		if (this.client && this.metadata) return { client: this.client, metadata: this.metadata };

		const proto = protoLoader.loadSync(PROTO_PATH, {
			includeDirs: [path.dirname(PROTO_PATH)],
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true
		});

		const loaded = grpc.loadPackageDefinition(proto) as Record<string, unknown>;
		const ServiceConstructor = (loaded.serverpb as Record<string, unknown>)?.Server as typeof grpc.Client;
		if (!ServiceConstructor) throw new Error("BlockRazor: serverpb.Server not found in proto");

		const client = new ServiceConstructor(this.grpcEndpoint, grpc.credentials.createInsecure(), {
			"grpc.keepalive_time_ms": 40000,
			"grpc.keepalive_timeout_ms": 10000,
			"grpc.keepalive_permit_without_calls": 1
		}) as SendServiceClient;

		await new Promise<void>((resolve, reject) => {
			client.waitForReady(Date.now() + CLIENT_READY_TIMEOUT_MS, (err?: Error) => {
				if (err) reject(new Error(`BlockRazor connect timeout: ${err.message}`));
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
