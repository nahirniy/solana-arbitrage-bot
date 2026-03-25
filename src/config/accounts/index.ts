import { DexType } from "../../types";

import type { DexAccountsProvider } from "../../types";

import { getPumpSwapAccounts } from "./pumpswap";
import { getMeteoraAccounts } from "./meteora";

// Adding a new DEX = create accounts file + register here
export const dexAccountProviders = new Map<DexType, DexAccountsProvider>([
	[DexType.PUMPSWAP, getPumpSwapAccounts],
	[DexType.METEORA_DLMM, getMeteoraAccounts]
]);
