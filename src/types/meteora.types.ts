export interface MeteoraFeeParams {
	readonly baseFactor: number;
	readonly filterPeriod: number;
	readonly decayPeriod: number;
	readonly reductionFactor: number;
	readonly variableFeeControl: number;
	readonly maxVolatilityAccumulator: number;
	volatilityAccumulator: number;
	volatilityReference: number;
	indexReference: number;
	lastUpdateTimestamp: number;
}

export interface MeteoraBin {
	readonly id: number;
	amountX: bigint;
	amountY: bigint;
}

export interface MeteoraBinArray {
	readonly index: number;
	readonly lbPair: string;
	bins: MeteoraBin[];
}

import type { TokenSymbol } from "./dex.types";

export interface MeteoraPoolState {
	readonly poolAddress: string;
	activeId: number;
	readonly binStep: number;
	readonly tokenXMint: string;
	readonly tokenYMint: string;
	readonly reserveX: string;
	readonly reserveY: string;
	baseSymbol: TokenSymbol;
	quoteSymbol: TokenSymbol;
	feeParams: MeteoraFeeParams;
	binArrays: Map<number, MeteoraBinArray>;
	price: bigint;
}
