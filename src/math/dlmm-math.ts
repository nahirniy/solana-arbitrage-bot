import { PRECISION, FEE_PRECISION } from "../config";
import { DlmmBin, DlmmFeeParams } from "../types";
import { min } from "./bigint-math";

function powPrecision(base: bigint, exp: number): bigint {
	if (exp === 0) return PRECISION;

	let result = PRECISION;
	let b = base;
	let e = Math.abs(exp);

	while (e > 0) {
		if (e & 1) result = (result * b) / PRECISION;
		b = (b * b) / PRECISION;
		e >>= 1;
	}

	if (exp < 0) return (PRECISION * PRECISION) / result;
	return result;
}

// (1 + binStep / 10000) ^ binId, PRECISION-scaled
// activeId is signed i32 from on-chain — already the exponent, no offset needed
export function getBinPrice(binId: number, binStep: number): bigint {
	const base = PRECISION + (BigInt(binStep) * PRECISION) / 10_000n;
	return powPrecision(base, binId);
}

// Fee rate in FEE_PRECISION (1e9) units
export function getDlmmFeeRate(feeParams: DlmmFeeParams, binStep: number): bigint {
	const baseFeeRate = BigInt(feeParams.baseFactor) * BigInt(binStep) * 10n;

	let variableFeeRate = 0n;
	if (feeParams.variableFeeControl > 0) {
		const vsBinStep = BigInt(feeParams.volatilityAccumulator) * BigInt(binStep);
		variableFeeRate = (BigInt(feeParams.variableFeeControl) * vsBinStep * vsBinStep) / 100n / 10_000n;
	}

	return baseFeeRate + variableFeeRate;
}

// How much output for a given input, walking through bins.
// swapXtoY: selling X for Y (lower bin IDs), !swapXtoY: selling Y for X (higher bin IDs)
// Bins must be pre-ordered: descending IDs for X→Y, ascending for Y→X.
export function dlmmGetAmountOut(
	amountIn: bigint,
	orderedBins: readonly DlmmBin[],
	binStep: number,
	feeRate: bigint,
	swapXtoY: boolean
): bigint {
	let remaining = amountIn;
	let totalOut = 0n;

	for (const bin of orderedBins) {
		if (remaining <= 0n) break;

		const fee = (remaining * feeRate + FEE_PRECISION - 1n) / FEE_PRECISION;
		const afterFee = remaining - fee;
		const price = getBinPrice(bin.id, binStep);

		if (swapXtoY) {
			const out = (afterFee * price) / PRECISION;
			if (out <= bin.amountY) {
				totalOut += out;
				break;
			}
			totalOut += bin.amountY;
			const consumed = (bin.amountY * PRECISION + price - 1n) / price;
			const gross = (consumed * FEE_PRECISION + FEE_PRECISION - feeRate - 1n) / (FEE_PRECISION - feeRate);
			remaining -= min(gross, remaining);
		} else {
			const out = (afterFee * PRECISION) / price;
			if (out <= bin.amountX) {
				totalOut += out;
				break;
			}
			totalOut += bin.amountX;
			const consumed = (bin.amountX * price + PRECISION - 1n) / PRECISION;
			const gross = (consumed * FEE_PRECISION + FEE_PRECISION - feeRate - 1n) / (FEE_PRECISION - feeRate);
			remaining -= min(gross, remaining);
		}
	}

	return totalOut;
}

// How much input needed for a desired output, walking through bins.
export function dlmmGetAmountIn(
	amountOut: bigint,
	orderedBins: readonly DlmmBin[],
	binStep: number,
	feeRate: bigint,
	swapXtoY: boolean
): bigint {
	let remainingOut = amountOut;
	let totalIn = 0n;

	for (const bin of orderedBins) {
		if (remainingOut <= 0n) break;

		const price = getBinPrice(bin.id, binStep);
		const available = swapXtoY ? bin.amountY : bin.amountX;
		const take = min(remainingOut, available);

		// reverse the swap: how much net input produces `take` output
		let netIn: bigint;
		if (swapXtoY) {
			netIn = (take * PRECISION + price - 1n) / price;
		} else {
			netIn = (take * price + PRECISION - 1n) / PRECISION;
		}

		// gross up for fee: grossIn * (1 - feeRate/FEE_PRECISION) = netIn
		const grossIn = (netIn * FEE_PRECISION + FEE_PRECISION - feeRate - 1n) / (FEE_PRECISION - feeRate);

		totalIn += grossIn;
		remainingOut -= take;
	}

	return totalIn;
}
