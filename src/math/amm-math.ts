import { PRECISION, MAX_BIPS } from "../config";

// Constant product swap (x * y = k)
// Fee is passed as basis points — deducted from input before calculation
// Works for any AMM: PumpFun (25 bips)
export function ammGetAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBips: bigint): bigint {
	if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;

	const amountInWithFee = amountIn * (MAX_BIPS - feeBips);
	return (amountInWithFee * reserveOut) / (reserveIn * MAX_BIPS + amountInWithFee);
}

// Inverse: required input for a desired output amount
export function ammGetAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint, feeBips: bigint): bigint {
	if (amountOut <= 0n || reserveIn <= 0n || amountOut >= reserveOut) return 0n;

	return (reserveIn * amountOut * MAX_BIPS) / ((reserveOut - amountOut) * (MAX_BIPS - feeBips)) + 1n;
}

// Price of 1 whole base token in quote token units, PRECISION-scaled
// Adjusts for decimal difference between base and quote
export function ammGetPrice(baseReserve: bigint, quoteReserve: bigint, baseDecimals: number, quoteDecimals: number): bigint {
	if (baseReserve <= 0n) return 0n;
	const decimalAdjust = BigInt(10 ** Math.abs(baseDecimals - quoteDecimals));
	if (baseDecimals > quoteDecimals) {
		return (quoteReserve * PRECISION * decimalAdjust) / baseReserve;
	}
	return (quoteReserve * PRECISION) / (baseReserve * decimalAdjust);
}
