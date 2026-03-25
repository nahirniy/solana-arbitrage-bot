import { PRECISION, FEE_PRECISION } from "../config";
import { MeteoraBin, MeteoraFeeParams } from "../types";
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

// Recompute volatility accumulator the same way the on-chain program does at swap time.
// If enough time has passed, reference decays or resets. Then delta from current active bin.
// Recompute volatility accumulator the same way the on-chain program does at swap time.
// The program updates indexReference to activeId BEFORE computing delta,
// so if activeId hasn't changed since last update, delta = 0 and variable fee = 0
export function updateVolatilityAccumulator(feeParams: MeteoraFeeParams, currentTimestamp: number): number {
	const elapsed = currentTimestamp - feeParams.lastUpdateTimestamp;
	if (elapsed < feeParams.filterPeriod) return feeParams.volatilityAccumulator;

	let vRef: number;
	if (elapsed >= feeParams.decayPeriod) {
		vRef = 0;
	} else {
		vRef = Math.floor((feeParams.volatilityReference * feeParams.reductionFactor) / 10_000);
	}

	return Math.min(vRef, feeParams.maxVolatilityAccumulator);
}

// Fee rate in FEE_PRECISION (1e9) units
export function getMeteoraFeeRate(feeParams: MeteoraFeeParams, binStep: number): bigint {
	const va = updateVolatilityAccumulator(feeParams, Math.floor(Date.now() / 1000));
	const baseFeeRate = BigInt(feeParams.baseFactor) * BigInt(binStep) * 10n;

	let variableFeeRate = 0n;
	if (feeParams.variableFeeControl > 0 && va > 0) {
		const vsBinStep = BigInt(va) * BigInt(binStep);
		variableFeeRate =
			(BigInt(feeParams.variableFeeControl) * vsBinStep * vsBinStep + 99_999_999_999n) / 100_000_000_000n;
	}

	return baseFeeRate + variableFeeRate;
}

// How much output for a given input, walking through bins.
// swapXtoY: selling X for Y (lower bin IDs), !swapXtoY: selling Y for X (higher bin IDs)
// Bins must be pre-ordered: descending IDs for X→Y, ascending for Y→X.
// Fee rate changes per bin via va(k) = vr + |ir - (activeID ± k)| * 10000
export function meteoraGetAmountOut(
	amountIn: bigint,
	orderedBins: readonly MeteoraBin[],
	binStep: number,
	feeParams: MeteoraFeeParams,
	swapXtoY: boolean
): bigint {
	const activeId = orderedBins.length > 0 ? orderedBins[0].id : 0;
	const va0 = updateVolatilityAccumulator(feeParams, Math.floor(Date.now() / 1000));
	const baseFeeRate = BigInt(feeParams.baseFactor) * BigInt(binStep) * 10n;
	const vfc = BigInt(feeParams.variableFeeControl);
	const bs = BigInt(binStep);

	let remaining = amountIn;
	let totalOut = 0n;

	for (const bin of orderedBins) {
		if (remaining <= 0n) break;

		const k = Math.abs(bin.id - activeId);
		const va = va0 + k * 10_000;
		let varFee = 0n;
		if (vfc > 0n && va > 0) {
			const vsBinStep = BigInt(va) * bs;
			varFee = (vfc * vsBinStep * vsBinStep + 99_999_999_999n) / 100_000_000_000n;
		}
		const feeRate = baseFeeRate + varFee;

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
export function meteoraGetAmountIn(
	amountOut: bigint,
	orderedBins: readonly MeteoraBin[],
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
