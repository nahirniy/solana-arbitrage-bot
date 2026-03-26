import type { ArbPoolsConfig, ArbOpportunity } from "../types";
import type { PoolWithState } from "../math/arbitrage-math";
import type { ArbExecutorService } from "../execution";
import { MIN_PROFIT_LAMPORTS, MIN_TIP_LAMPORTS, TIP_PERCENT } from "../config";
import { PoolStateService } from "../state";
import { findBestRoute, simulateArbitrage } from "../math";
import { log } from "../utils";

export class ArbDetectorService {
	private readonly arbConfigs: ArbPoolsConfig[] = [];

	constructor(
		private readonly poolState: PoolStateService,
		private readonly executor: ArbExecutorService | null = null
	) {}

	scan(slot: number): void {
		for (const config of this.arbConfigs) {
			const pools: PoolWithState[] = [];

			for (const pool of config.pools) {
				const state = this.poolState.getPoolState(pool.poolAddress);
				if (state) pools.push({ pool, state });
			}

			const found = findBestRoute(pools);
			if (!found) continue;

			const opportunity = simulateArbitrage(found.route, found.buyState, found.sellState, slot);
			this.logResult(opportunity);

			if (opportunity.profitLamports >= MIN_PROFIT_LAMPORTS && this.executor) {
				const tipFromProfit = Math.floor(Number(opportunity.profitLamports) * TIP_PERCENT / 100);
				const tipLamports = Math.max(tipFromProfit, MIN_TIP_LAMPORTS);
				void this.executor.execute(opportunity, tipLamports);
			}
		}
	}

	addConfig(config: ArbPoolsConfig): void {
		this.arbConfigs.push(config);
	}

	private logResult(opp: ArbOpportunity): void {
		const profitSol = Number(opp.profitLamports) / 1e9;
		const prefix = opp.profitLamports >= MIN_PROFIT_LAMPORTS ? "PROFIT" : "NO-ARB";

		log.arb(
			`[${prefix}] buy=${opp.route.buyDex} sell=${opp.route.sellDex} ` +
				`profit=${profitSol.toFixed(6)} SOL | slot=${opp.slot}`
		);
	}
}
