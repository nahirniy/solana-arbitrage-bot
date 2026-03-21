export interface DlmmFeeParams {
	readonly baseFactor: number;
	readonly variableFeeControl: number;
	readonly maxVolatilityAccumulator: number;
	volatilityAccumulator: number;
	volatilityReference: number;
}

export interface DlmmBin {
	readonly id: number;
	amountX: bigint;
	amountY: bigint;
}

export interface DlmmBinArray {
	readonly index: number;
	readonly lbPair: string;
	bins: DlmmBin[];
}

import type { TokenSymbol } from "./dex.types";

export interface DlmmPoolState {
	readonly poolAddress: string;
	activeId: number;
	readonly binStep: number;
	readonly tokenXMint: string;
	readonly tokenYMint: string;
	readonly reserveX: string;
	readonly reserveY: string;
	baseSymbol: TokenSymbol;
	quoteSymbol: TokenSymbol;
	feeParams: DlmmFeeParams;
	binArrays: Map<number, DlmmBinArray>;
	price: bigint;
}
