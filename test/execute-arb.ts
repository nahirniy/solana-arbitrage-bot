import "dotenv/config";
import { Connection } from "@solana/web3.js";
import { loadEnv, buildArbPoolsConfigs, MIN_TRADE_LAMPORTS, MIN_TIP_LAMPORTS } from "../src/config";
import { PoolStateService, initializeState } from "../src/state";
import { initializeExecution } from "../src/execution";
import { decodeTokenAccountBalance } from "../src/decoders";
import { DexType } from "../src/types";
import type { ArbRoute, ArbOpportunity } from "../src/types";
import type { ArbExecutorService } from "../src/execution";
import { findBestRoute } from "../src/math";
import type { PoolWithState } from "../src/math/arbitrage-math";
import { log, formatError, initTelegram } from "../src/utils";

const MODE = process.argv[2] || "simulate"; // "simulate" | "execute"

async function main(): Promise<void> {
	const env = loadEnv();
	initTelegram(env.telegram);
	const arbPoolsConfigs = buildArbPoolsConfigs();

	log.info(`[test] Mode: ${MODE}`);
	log.info("[test] Loading pool states...");
	const poolState = new PoolStateService();
	await initializeState(env.connection, arbPoolsConfigs, poolState);

	log.info("[test] Initializing execution...");
	const executor = await initializeExecution(env, poolState, arbPoolsConfigs);

	const config = arbPoolsConfigs[0];
	const pumpPool = config.pools.find((p) => p.dexType === DexType.PUMPSWAP);
	const meteoraPool = config.pools.find((p) => p.dexType === DexType.METEORA);
	if (!pumpPool || !meteoraPool) throw new Error("Pool config incomplete");

	const buyPumpSellMeteora: ArbRoute = {
		buyDex: DexType.PUMPSWAP,
		buyPoolAddress: pumpPool.poolAddress,
		sellDex: DexType.METEORA,
		sellPoolAddress: meteoraPool.poolAddress
	};

	const buyMeteoraSellPump: ArbRoute = {
		buyDex: DexType.METEORA,
		buyPoolAddress: meteoraPool.poolAddress,
		sellDex: DexType.PUMPSWAP,
		sellPoolAddress: pumpPool.poolAddress
	};

	// Simulate both directions to find best
	const pools: PoolWithState[] = config.pools
		.map((p) => ({ pool: p, state: poolState.getPoolState(p.poolAddress)! }))
		.filter((p) => p.state);

	const best = findBestRoute(pools);
	if (!best) {
		log.error("[test] No valid route found");
		return;
	}

	const direction =
		best.route.buyDex === DexType.PUMPSWAP ? "Buy PumpSwap → Sell Meteora" : "Buy Meteora → Sell PumpSwap";

	log.info(`[test] Best route: ${direction}`);

	if (MODE === "simulate") {
		await simulateRoute(env.connection, executor, buyPumpSellMeteora, "Buy PumpSwap → Sell Meteora");
		await simulateRoute(env.connection, executor, buyMeteoraSellPump, "Buy Meteora → Sell PumpSwap");
	} else if (MODE === "execute") {
		const opportunity: ArbOpportunity = {
			route: best.route,
			inputAmountLamports: MIN_TRADE_LAMPORTS,
			intermediateTokens: 0n,
			outputAmountLamports: 0n,
			profitLamports: 0n,
			buyPrice: best.buyState.price,
			sellPrice: best.sellState.price,
			slot: 0,
			timestamp: Date.now()
		};
		log.info(`[test] Executing arb: ${direction} | amount: ${Number(MIN_TRADE_LAMPORTS) / 1e9} SOL | tip: ${MIN_TIP_LAMPORTS / 1e9} SOL`);
		await executor.execute(opportunity, MIN_TIP_LAMPORTS);
	}
}

async function simulateRoute(
	connection: Connection,
	executor: ArbExecutorService,
	route: ArbRoute,
	label: string
): Promise<void> {
	const amount = MIN_TRADE_LAMPORTS;
	log.info(`\n[test] === ${label} (${Number(amount) / 1e9} SOL) ===`);

	const wsolAta = executor.wallet.userQuoteAta;

	const wsolInfo = await connection.getAccountInfo(wsolAta);
	const wsolBefore = wsolInfo ? decodeTokenAccountBalance(wsolInfo.data as Buffer) ?? 0n : 0n;

	const result = await executor.simulate(route, amount, [wsolAta.toBase58()]);

	if (result.err) {
		log.error(`[test] FAILED: ${JSON.stringify(result.err)}`);
		if (result.logs) {
			for (const line of result.logs) {
				if (line.includes("Program log:") || line.includes("failed")) {
					console.log(`  ${line}`);
				}
			}
		}
		return;
	}

	let wsolAfter = 0n;
	if (result.accounts?.[0]?.data) {
		const data = Buffer.from(result.accounts[0].data[0], "base64");
		wsolAfter = decodeTokenAccountBalance(data) ?? 0n;
	}

	const delta = wsolAfter - wsolBefore;
	const profit = delta - amount;

	log.success(`[test] OK — CU: ${result.unitsConsumed}`);
	console.log(`  WSOL before:  ${formatSol(wsolBefore)}`);
	console.log(`  WSOL after:   ${formatSol(wsolAfter)}`);
	console.log(`  Delta:        ${formatSol(delta)}`);
	console.log(`  Profit (net): ${formatSol(profit)}`);
}

function formatSol(lamports: bigint): string {
	const sign = lamports < 0n ? "-" : "";
	const abs = lamports < 0n ? -lamports : lamports;
	return `${sign}${(Number(abs) / 1e9).toFixed(9)} SOL`;
}

main().catch((err) => {
	log.error(`[test] Fatal: ${formatError(err)}`);
	process.exit(1);
});
