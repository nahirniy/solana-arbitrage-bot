import "dotenv/config";
import { Connection } from "@solana/web3.js";
import { loadEnv, buildArbPoolsConfigs } from "../src/config";
import { PoolStateService, initializeState } from "../src/state";
import { initializeExecution } from "../src/execution";
import { decodeTokenAccountBalance } from "../src/decoders";
import { DexType } from "../src/types";
import type { ArbRoute } from "../src/types";
import type { ArbExecutorService } from "../src/execution";
import { log, formatError } from "../src/utils";

const TEST_AMOUNT = 1_000_000n; // 0.001 SOL

async function main(): Promise<void> {
	const env = loadEnv();
	const arbPoolsConfigs = buildArbPoolsConfigs();

	log.info("[test] Loading pool states...");
	const poolState = new PoolStateService();
	await initializeState(env.connection, arbPoolsConfigs, poolState);

	log.info("[test] Initializing execution...");
	const executor = await initializeExecution(env, poolState, arbPoolsConfigs);

	const config = arbPoolsConfigs[0];
	const pumpPool = config.pools.find((p) => p.dexType === DexType.PUMPFUN_AMM);
	const meteoraPool = config.pools.find((p) => p.dexType === DexType.METEORA_DLMM);
	if (!pumpPool || !meteoraPool) throw new Error("Pool config incomplete");

	const buyPumpSellMeteora: ArbRoute = {
		buyDex: DexType.PUMPFUN_AMM,
		buyPoolAddress: pumpPool.poolAddress,
		sellDex: DexType.METEORA_DLMM,
		sellPoolAddress: meteoraPool.poolAddress
	};

	const buyMeteoraSellPump: ArbRoute = {
		buyDex: DexType.METEORA_DLMM,
		buyPoolAddress: meteoraPool.poolAddress,
		sellDex: DexType.PUMPFUN_AMM,
		sellPoolAddress: pumpPool.poolAddress
	};

	await simulateRoute(env.connection, executor, buyPumpSellMeteora, "Buy PumpFun → Sell Meteora");
	await simulateRoute(env.connection, executor, buyMeteoraSellPump, "Buy Meteora → Sell PumpFun");
}

async function simulateRoute(
	connection: Connection,
	executor: ArbExecutorService,
	route: ArbRoute,
	label: string
): Promise<void> {
	log.info(`\n[test] === ${label} (${Number(TEST_AMOUNT) / 1e9} SOL) ===`);

	const wsolAta = executor.wallet.userQuoteAta;

	const wsolInfo = await connection.getAccountInfo(wsolAta);
	const wsolBefore = wsolInfo ? decodeTokenAccountBalance(wsolInfo.data as Buffer) ?? 0n : 0n;

	const result = await executor.simulate(route, TEST_AMOUNT, [wsolAta.toBase58()]);

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
	const profit = delta - TEST_AMOUNT;

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
