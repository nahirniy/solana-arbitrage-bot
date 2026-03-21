import { DexType, TokenSymbol } from "../types";
import type { PoolDetails, ArbPoolsConfig, DexPoolConfig } from "../types";
import { POOL_ADDRESSES } from "./addresses";

// All pool details in one place - addresses come from addresses.ts
const POOL_DETAILS: readonly PoolDetails[] = [
	{
		dexType: DexType.PUMPFUN_AMM,
		baseToken: TokenSymbol.LIA,
		quoteToken: TokenSymbol.WSOL,
		poolAddress: POOL_ADDRESSES.PUMPFUN_LIA_SOL
	},
	{
		dexType: DexType.METEORA_DLMM,
		baseToken: TokenSymbol.LIA,
		quoteToken: TokenSymbol.WSOL,
		poolAddress: POOL_ADDRESSES.METEORA_LIA_SOL
	}
];

// Groups POOL_DETAILS by token combination
// [PumpFun LIA/SOL, Meteora LIA/SOL] → [{LIA/SOL, pools: [PumpFun, Meteora]}]
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
