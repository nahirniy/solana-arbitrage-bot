import type { TokenSymbol } from "./dex.types";

export interface PumpFeeTier {
	readonly thresholdLamports: bigint;
	readonly lpBps: bigint;
	readonly protocolBps: bigint;
	readonly creatorBps: bigint;
}

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
	feeBps: readonly bigint[];
}
