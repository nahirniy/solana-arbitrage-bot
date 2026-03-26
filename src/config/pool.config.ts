import { DexType, TokenSymbol } from "../types";
import type { PoolDetails, ArbPoolsConfig, DexPoolConfig } from "../types";

const POOL_DETAILS: readonly PoolDetails[] = [
	{
		dexType: DexType.PUMPSWAP,
		baseToken: TokenSymbol.LIA,
		quoteToken: TokenSymbol.WSOL,
		poolAddress: "8BhCzFjnHmFyZEdh6JNgoQNRHCS2R8KHKYpGviocNYSa"
	},
	{
		dexType: DexType.METEORA,
		baseToken: TokenSymbol.LIA,
		quoteToken: TokenSymbol.WSOL,
		poolAddress: "HPx4ySmLFFWWwwA8q7bgXZncoAmDgEmyJKdbSvucx7AJ"
	}
];

// Groups POOL_DETAILS by token combination
// [PumpSwap LIA/SOL, Meteora LIA/SOL] → [{LIA/SOL, pools: [PumpSwap, Meteora]}]
export function buildArbPoolsConfigs(): ArbPoolsConfig[] {
	// key = "LIA:SOL", value = all pools for that token
	const arbPoolsMap = new Map<string, { baseToken: TokenSymbol; quoteToken: TokenSymbol; pools: DexPoolConfig[] }>();

	for (const pool of POOL_DETAILS) {
		const key = `${pool.baseToken}:${pool.quoteToken}`;
		let arbConfig = arbPoolsMap.get(key);

		if (!arbConfig) {
			arbConfig = { baseToken: pool.baseToken, quoteToken: pool.quoteToken, pools: [] };
			arbPoolsMap.set(key, arbConfig);
		}

		arbConfig.pools.push({ dexType: pool.dexType, poolAddress: pool.poolAddress });
	}

	return Array.from(arbPoolsMap.values());
}
