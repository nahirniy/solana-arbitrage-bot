import { DexType } from "./dex.types";

export interface ArbRoute {
	readonly buyDex: DexType;
	readonly buyPoolAddress: string;
	readonly sellDex: DexType;
	readonly sellPoolAddress: string;
}

export interface ArbOpportunity {
	readonly route: ArbRoute;
	readonly inputAmountLamports: bigint;
	readonly intermediateTokens: bigint;
	readonly outputAmountLamports: bigint;
	readonly profitLamports: bigint;
	readonly buyPrice: bigint;
	readonly sellPrice: bigint;
	readonly slot: number;
	readonly timestamp: number;
}
