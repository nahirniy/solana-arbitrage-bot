import { MAX_BIPS, PRECISION } from "../config";

function ceilDiv(a: bigint, b: bigint): bigint {
	return (a + b - 1n) / b;
}

// ── PumpSwap AMM buy (SOL → Token) ──────────────────────────────────
//
// PumpSwap deducts fees from input before the swap. Unlike Uniswap where fee
// is embedded in the formula, here each fee component (LP, protocol, creator)
// is ceil-rounded independently, then subtracted from input.
//
// The pool also applies a -1 safety margin on the effective input (pool always
// rounds in its own favor), so the final formula is pure constant product on
// the reduced amount.
//
// feeBps: [lpBps, protocolBps, creatorBps]
export function pumpSwapGetBuyOutput(
	amountIn: bigint,
	reserveIn: bigint,
	reserveOut: bigint,
	feeBps: readonly bigint[]
): bigint {
	if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;

	let totalBps = 0n;
	for (const bps of feeBps) {
		totalBps += bps;
	}

	// Approximate effective input from aggregate fee rate
	let effectiveIn = (amountIn * MAX_BIPS) / (MAX_BIPS + totalBps);

	// Individual ceil-rounded fees may exceed the aggregate estimate — adjust
	let fee = 0n;
	for (const bps of feeBps) {
		fee += ceilDiv(effectiveIn * bps, MAX_BIPS);
	}
	if (effectiveIn + fee > amountIn) effectiveIn -= 1n;

	return ((effectiveIn - 1n) * reserveOut) / (reserveIn + effectiveIn - 1n);
}

// ── PumpSwap AMM sell (Token → SOL) ──────────────────────────────────
//
// Sell is straightforward: constant product first, fees after.
//   grossOut = floor(amountIn * reserveOut / (reserveIn + amountIn))
//
// Each fee is ceil-rounded independently from grossOut.
//
// feeBps: [lpBps, protocolBps, creatorBps]
export function pumpSwapGetSellOutput(
	amountIn: bigint,
	reserveIn: bigint,
	reserveOut: bigint,
	feeBps: readonly bigint[]
): bigint {
	if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;

	const grossOut = (amountIn * reserveOut) / (reserveIn + amountIn);

	let totalFee = 0n;
	for (const bps of feeBps) {
		totalFee += ceilDiv(grossOut * bps, MAX_BIPS);
	}

	return grossOut - totalFee;
}

// Price of 1 whole base token in quote token units, PRECISION-scaled
export function pumpSwapGetPrice(
	baseReserve: bigint,
	quoteReserve: bigint,
	baseDecimals: number,
	quoteDecimals: number
): bigint {
	if (baseReserve <= 0n) return 0n;
	const decimalAdjust = BigInt(10 ** Math.abs(baseDecimals - quoteDecimals));
	if (baseDecimals > quoteDecimals) {
		return (quoteReserve * PRECISION * decimalAdjust) / baseReserve;
	}
	return (quoteReserve * PRECISION) / (baseReserve * decimalAdjust);
}
