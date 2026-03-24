import { DexType } from "../../types";

import type { DexAccountsProvider } from "../../types";

import { getPumpFunAccounts } from "./pumpfun";
import { getMeteoraAccounts } from "./meteora";

// Adding a new DEX = create accounts file + register here
export const dexAccountProviders = new Map<DexType, DexAccountsProvider>([
	[DexType.PUMPFUN_AMM, getPumpFunAccounts],
	[DexType.METEORA_DLMM, getMeteoraAccounts]
]);
