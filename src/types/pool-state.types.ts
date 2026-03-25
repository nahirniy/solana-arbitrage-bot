import type { PumpSwapPoolState } from "./pumpswap.types";
import type { MeteoraPoolState } from "./meteora.types";

export type AnyPoolState = PumpSwapPoolState | MeteoraPoolState;

export interface PoolStateHandler {
	isSubscribed(pubkey: string): boolean;
	handleUpdate(pubkey: string, data: Buffer): boolean;
	getState(): AnyPoolState | null;
	getSubscriptionAddresses(): string[];
}
