import type { TokenSymbol } from "./dex.types";

export interface AmmPoolState {
	readonly poolAddress: string;
	readonly baseMint: string;
	readonly quoteMint: string;
	readonly baseVault: string;
	readonly quoteVault: string;
	baseSymbol: TokenSymbol;
	quoteSymbol: TokenSymbol;
	baseReserve: bigint;
	quoteReserve: bigint;
	price: bigint;
}
