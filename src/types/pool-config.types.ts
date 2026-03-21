import { DexType, TokenSymbol } from "./dex.types";

export interface PoolDetails {
	readonly dexType: DexType;
	readonly baseToken: TokenSymbol;
	readonly quoteToken: TokenSymbol;
	readonly poolAddress: string;
}

export interface DexPoolConfig {
	readonly dexType: DexType;
	readonly poolAddress: string;
}

export interface ArbPoolsConfig {
	readonly baseToken: TokenSymbol;
	readonly quoteToken: TokenSymbol;
	readonly pools: readonly DexPoolConfig[];
}
