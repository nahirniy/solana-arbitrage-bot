import { DexType } from "../types";
import type { PumpSwapPoolState, MeteoraPoolState, AnyPoolState, ArbRoute, ArbOpportunity, DexPoolConfig } from "../types";
import { MIN_TRADE_LAMPORTS, MAX_TRADE_LAMPORTS, DELTA_TRADE_LAMPORTS } from "../config";
import { pumpSwapGetBuyOutput, pumpSwapGetSellOutput } from "./pumpswap-math";
import { meteoraGetAmountOut } from "./meteora-math";

// Golden ratio for optimal amount search
const GOLDEN_RATIO = 6180n; // 0.618 * 10000
const GOLDEN_PRECISION = 10000n;

export interface PoolWithState {
	readonly pool: DexPoolConfig;
	readonly state: AnyPoolState;
}

// Finds cheapest and most expensive pool, returns route + states
export function findBestRoute(pools: readonly PoolWithState[]): {
	route: ArbRoute;
	buyState: AnyPoolState;
	sellState: AnyPoolState;
} | null {
	let cheapest: PoolWithState | null = null;
	let cheapestPrice = 0n;
	let mostExpensive: PoolWithState | null = null;
	let mostExpensivePrice = 0n;

	for (const entry of pools) {
		const price = entry.state.price;
		if (price === 0n) continue;

		if (!cheapest || price < cheapestPrice) {
			cheapest = entry;
			cheapestPrice = price;
		}
		if (!mostExpensive || price > mostExpensivePrice) {
			mostExpensive = entry;
			mostExpensivePrice = price;
		}
	}

	if (!cheapest || !mostExpensive || cheapest === mostExpensive) return null;

	return {
		route: {
			buyDex: cheapest.pool.dexType,
			buyPoolAddress: cheapest.pool.poolAddress,
			sellDex: mostExpensive.pool.dexType,
			sellPoolAddress: mostExpensive.pool.poolAddress
		},
		buyState: cheapest.state,
		sellState: mostExpensive.state
	};
}

export function simulateArbitrage(
	route: ArbRoute,
	buyState: AnyPoolState,
	sellState: AnyPoolState,
	slot: number
): ArbOpportunity {
	const { optimalAmountIn, profit } = findOptimalAmount(route, buyState, sellState);
	const baseTokenAmount = simulateBuy(optimalAmountIn, route.buyDex, buyState);
	const output = simulateSell(baseTokenAmount, route.sellDex, sellState);

	return {
		route,
		inputAmountLamports: optimalAmountIn,
		intermediateTokens: baseTokenAmount,
		outputAmountLamports: output,
		profitLamports: profit,
		buyPrice: buyState.price,
		sellPrice: sellState.price,
		slot,
		timestamp: Date.now()
	};
}

// Golden section search: finds the input amount that maximizes profit
function findOptimalAmount(
	route: ArbRoute,
	buyState: AnyPoolState,
	sellState: AnyPoolState
): { optimalAmountIn: bigint; profit: bigint } {
	let left = MIN_TRADE_LAMPORTS;
	let right = MAX_TRADE_LAMPORTS;

	const range = right - left;
	let amountIn1 = right - (range * GOLDEN_RATIO) / GOLDEN_PRECISION;
	let amountIn2 = left + (range * GOLDEN_RATIO) / GOLDEN_PRECISION;

	let profit1 = calcProfit(amountIn1, route, buyState, sellState);
	let profit2 = calcProfit(amountIn2, route, buyState, sellState);

	while (right - left > DELTA_TRADE_LAMPORTS) {
		if (profit1 < profit2) {
			left = amountIn1;
			amountIn1 = amountIn2;
			profit1 = profit2;
			amountIn2 = left + ((right - left) * GOLDEN_RATIO) / GOLDEN_PRECISION;
			profit2 = calcProfit(amountIn2, route, buyState, sellState);
		} else {
			right = amountIn2;
			amountIn2 = amountIn1;
			profit2 = profit1;
			amountIn1 = right - ((right - left) * GOLDEN_RATIO) / GOLDEN_PRECISION;
			profit1 = calcProfit(amountIn1, route, buyState, sellState);
		}
	}

	const optimalAmountIn = profit1 > profit2 ? amountIn1 : amountIn2;
	const profit = profit1 > profit2 ? profit1 : profit2;

	return { optimalAmountIn, profit: profit > 0n ? profit : profit };
}

function calcProfit(amountIn: bigint, route: ArbRoute, buyState: AnyPoolState, sellState: AnyPoolState): bigint {
	const tokens = simulateBuy(amountIn, route.buyDex, buyState);
	const solOut = simulateSell(tokens, route.sellDex, sellState);
	return solOut - amountIn;
}

// ── helpers ──────────────────────────────────────────────────────────

function assertNever(value: never): never {
	throw new Error(`Unhandled DEX type: ${value}`);
}

function simulateBuy(solIn: bigint, dexType: DexType, state: AnyPoolState): bigint {
	switch (dexType) {
		case DexType.PUMPSWAP: {
			const s = state as PumpSwapPoolState;
			return pumpSwapGetBuyOutput(solIn, s.quoteReserve, s.baseReserve, s.feeBps);
		}
		case DexType.METEORA: {
			const s = state as MeteoraPoolState;
			const bins = getOrderedBins(s, true);
			return meteoraGetAmountOut(solIn, bins, s.binStep, s.feeParams, false);
		}
		default:
			return assertNever(dexType);
	}
}

function simulateSell(tokensIn: bigint, dexType: DexType, state: AnyPoolState): bigint {
	switch (dexType) {
		case DexType.PUMPSWAP: {
			const s = state as PumpSwapPoolState;
			return pumpSwapGetSellOutput(tokensIn, s.baseReserve, s.quoteReserve, s.feeBps);
		}
		case DexType.METEORA: {
			const s = state as MeteoraPoolState;
			const bins = getOrderedBins(s, false);
			return meteoraGetAmountOut(tokensIn, bins, s.binStep, s.feeParams, true);
		}
		default:
			return assertNever(dexType);
	}
}

function getOrderedBins(state: MeteoraPoolState, buyingBase: boolean) {
	const allBins = Array.from(state.binArrays.values()).flatMap((arr) => arr.bins);

	if (buyingBase) {
		return allBins.filter((b) => b.id >= state.activeId).sort((a, b) => a.id - b.id);
	}

	return allBins.filter((b) => b.id <= state.activeId).sort((a, b) => b.id - a.id);
}
