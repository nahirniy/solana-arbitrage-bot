import type { PumpSwapPoolState } from "./pumpswap.types";
import type { DlmmPoolState } from "./dlmm.types";

export type AnyPoolState = PumpSwapPoolState | DlmmPoolState;

export interface PoolStateHandler {
	isSubscribed(pubkey: string): boolean;
	handleUpdate(pubkey: string, data: Buffer): boolean;
	getState(): AnyPoolState | null;
	getSubscriptionAddresses(): string[];
}
