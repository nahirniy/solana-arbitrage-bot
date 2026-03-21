import type { AmmPoolState } from "./amm.types";
import type { DlmmPoolState } from "./dlmm.types";

export type AnyPoolState = AmmPoolState | DlmmPoolState;

export interface PoolStateHandler {
	isSubscribed(pubkey: string): boolean;
	handleUpdate(pubkey: string, data: Buffer): boolean;
	getState(): AnyPoolState | null;
	getSubscriptionAddresses(): string[];
}
