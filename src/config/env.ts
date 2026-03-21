import { Connection } from "@solana/web3.js";

export interface EnvConfig {
	readonly rpcUrl: string;
	readonly geyserUrl: string;
	readonly connection: Connection;
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

	envConfig = { rpcUrl, geyserUrl, connection };
	return envConfig;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}
