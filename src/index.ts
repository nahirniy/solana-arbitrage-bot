import "dotenv/config";
import { loadEnv, buildArbPoolsConfigs } from "./config";
import { PoolStateService, initializeState } from "./state";
import { GeyserListenerService } from "./geyser";
import { ArbDetectorService } from "./arb";
import { initializeExecution } from "./execution";
import { log, formatError } from "./utils";

async function main(): Promise<void> {
	const env = loadEnv();
	const arbPoolsConfigs = buildArbPoolsConfigs();

	log.info(`[main] Starting arb bot — ${arbPoolsConfigs.length} pool group(s)`);

	const poolState = new PoolStateService();
	await initializeState(env.connection, arbPoolsConfigs, poolState);

	const executor = await initializeExecution(env, poolState, arbPoolsConfigs);

	const arbDetector = new ArbDetectorService(poolState, executor);
	for (const config of arbPoolsConfigs) {
		arbDetector.addConfig(config);
	}

	arbDetector.scan(0);

	const geyser = new GeyserListenerService(env.geyserUrl, env.connection, poolState, arbDetector);
	await geyser.start();

	log.success("[main] Bot running — scanning for arbitrage opportunities");
}

main().catch((err) => {
	log.error(`[main] Fatal: ${formatError(err)}`);
	process.exit(1);
});
