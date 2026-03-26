import { Connection } from "@solana/web3.js";

export interface RelayKeys {
	readonly heliusRpcUrl: string | null;
	readonly blockRazorGrpc: string | null;
	readonly blockRazorGrpcFee: string | null;
	readonly blockRazorToken: string | null;
	readonly astralaneApiKey: string | null;
	readonly astralaneRpcUrl: string | null;
	readonly stelliumApiKey: string | null;
	readonly stelliumRpcUrl: string | null;
	readonly slot0ApiKey: string | null;
	readonly slot0RpcUrl: string | null;
	readonly corvusFalconApiKey: string | null;
	readonly corvusFalconRpcUrl: string | null;
}

export interface TelegramConfig {
	readonly botToken: string;
	readonly chatId: string;
}

export interface EnvConfig {
	readonly rpcUrl: string;
	readonly geyserUrl: string;
	readonly connection: Connection;
	readonly privateKey: string;
	readonly nonceAddress: string | null;
	readonly lutAddress: string | null;
	readonly relayKeys: RelayKeys;
	readonly telegram: TelegramConfig | null;
}

let envConfig: EnvConfig | null = null;

export function getEnv(): EnvConfig {
	if (!envConfig) throw new Error("Environment not loaded. Call loadEnv() first.");
	return envConfig;
}

export function loadEnv(): EnvConfig {
	if (envConfig) return envConfig;

	const rpcUrl = requireEnv("RPC_URL");
	const geyserUrl = requireEnv("GEYSER_URL");

	const connection = new Connection(rpcUrl, {
		commitment: "confirmed",
		disableRetryOnRateLimit: false
	});

	const privateKey = requireEnv("PRIVATE_KEY");
	const nonceAddress = process.env["NONCE_ADDRESS"] || null;
	const lutAddress = process.env["LUT_ADDRESS"] || null;

	const relayKeys: RelayKeys = {
		heliusRpcUrl: process.env["HELIUS_RPC_URL"] || null,
		blockRazorGrpc: process.env["BLOCKRAZOR_SOLANA_GRPC"] || null,
		blockRazorGrpcFee: process.env["BLOCKRAZOR_SOLANA_GRPC_FEE"] || null,
		blockRazorToken: process.env["BLOCKRAZOR_SOLANA_TOKEN"] || null,
		astralaneApiKey: process.env["ASTRALANE_API_KEY"] || null,
		astralaneRpcUrl: process.env["ASTRALANE_RPC_URL"] || null,
		stelliumApiKey: process.env["STELLIUM_API_KEY"] || null,
		stelliumRpcUrl: process.env["STELLIUM_RPC_URL"] || null,
		slot0ApiKey: process.env["SLOT0_API_KEY"] || null,
		slot0RpcUrl: process.env["SLOT0_RPC_URL"] || null,
		corvusFalconApiKey: process.env["CORVUS_FALCON_API_KEY"] || null,
		corvusFalconRpcUrl: process.env["CORVUS_FALCON_RPC_URL"] || null
	};

	const botToken = process.env["TELEGRAM_BOT_TOKEN"] || null;
	const chatId = process.env["TELEGRAM_CHAT_ID"] || null;
	const telegram = botToken && chatId ? { botToken, chatId } : null;

	envConfig = { rpcUrl, geyserUrl, connection, privateKey, nonceAddress, lutAddress, relayKeys, telegram };
	return envConfig;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}
