import { DexType } from "../types";
import type { AmmPoolState, DlmmPoolState, AnyPoolState, ArbRoute, ArbOpportunity, DexPoolConfig } from "../types";
import { FIXED_TRADE_SIZE_LAMPORTS } from "../config";
import { PUMPFUN_LP_FEE_BIPS, PUMPFUN_PROTOCOL_FEE_BIPS, PUMPFUN_CREATOR_FEE_BIPS } from "../config";
import { ammGetBuyOutput, ammGetSellOutput } from "./amm-math";
import { dlmmGetAmountOut } from "./dlmm-math";

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
	const input = FIXED_TRADE_SIZE_LAMPORTS;
	const baseTokenAmount = simulateBuy(input, route.buyDex, buyState);
	const output = simulateSell(baseTokenAmount, route.sellDex, sellState);

	return {
		route,
		inputAmountLamports: input,
		intermediateTokens: baseTokenAmount,
		outputAmountLamports: output,
		profitLamports: output - input,
		buyPrice: buyState.price,
		sellPrice: sellState.price,
		slot,
		timestamp: Date.now()
	};
}

// ── helpers ──────────────────────────────────────────────────────────

function assertNever(value: never): never {
	throw new Error(`Unhandled DEX type: ${value}`);
}

function simulateBuy(solIn: bigint, dexType: DexType, state: AnyPoolState): bigint {
	switch (dexType) {
		case DexType.PUMPFUN_AMM: {
			const s = state as AmmPoolState;
			return ammGetBuyOutput(solIn, s.quoteReserve, s.baseReserve, [
				PUMPFUN_LP_FEE_BIPS,
				PUMPFUN_PROTOCOL_FEE_BIPS,
				PUMPFUN_CREATOR_FEE_BIPS
			]);
		}
		case DexType.METEORA_DLMM: {
			const s = state as DlmmPoolState;
			const bins = getOrderedBins(s, true);
			return dlmmGetAmountOut(solIn, bins, s.binStep, s.feeParams, false);
		}
		default:
			return assertNever(dexType);
	}
}

function simulateSell(tokensIn: bigint, dexType: DexType, state: AnyPoolState): bigint {
	switch (dexType) {
		case DexType.PUMPFUN_AMM: {
			const s = state as AmmPoolState;
			return ammGetSellOutput(tokensIn, s.baseReserve, s.quoteReserve, [
				PUMPFUN_LP_FEE_BIPS,
				PUMPFUN_PROTOCOL_FEE_BIPS,
				PUMPFUN_CREATOR_FEE_BIPS
			]);
		}
		case DexType.METEORA_DLMM: {
			const s = state as DlmmPoolState;
			const bins = getOrderedBins(s, false);
			return dlmmGetAmountOut(tokensIn, bins, s.binStep, s.feeParams, true);
		}
		default:
			return assertNever(dexType);
	}
}

function getOrderedBins(state: DlmmPoolState, buyingBase: boolean) {
	const allBins = Array.from(state.binArrays.values()).flatMap((arr) => arr.bins);

	if (buyingBase) {
		return allBins.filter((b) => b.id >= state.activeId).sort((a, b) => a.id - b.id);
	}

	return allBins.filter((b) => b.id <= state.activeId).sort((a, b) => b.id - a.id);
}
