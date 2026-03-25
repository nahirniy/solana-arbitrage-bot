import { Connection, PublicKey } from "@solana/web3.js";
import { BINS_PER_ARRAY } from "../config";
import type { DexPoolConfig, ArbPoolsConfig, PumpFeeTier } from "../types";
import { DexType, TokenSymbol } from "../types";
import {
	decodePumpSwapPool,
	decodePumpFeeConfig,
	selectFeeTier,
	decodeTokenAccountBalance,
	decodeMeteoraPool,
	decodeMeteoraBinArray
} from "../decoders";
import { PUMP_FEE_CONFIG } from "../config/program.config";
import { retry, log, deriveBinArrayPDA, formatPrice } from "../utils";
import { PumpSwapStateService } from "./pumpswap-state.service";
import { MeteoraStateService } from "./meteora-state.service";
import { PoolStateService } from "./pool-state.service";

export async function initializeState(
	connection: Connection,
	arbPoolsConfigs: readonly ArbPoolsConfig[],
	poolState: PoolStateService
): Promise<void> {
	for (const config of arbPoolsConfigs) {
		for (const pool of config.pools) {
			switch (pool.dexType) {
				case DexType.PUMPSWAP:
					await initPumpSwap(connection, pool, poolState, config.baseToken, config.quoteToken);
					break;
				case DexType.METEORA:
					await initMeteora(connection, pool, poolState, config.baseToken, config.quoteToken);
					break;
				default:
					assertNever(pool.dexType);
			}
		}
	}
}

async function initPumpSwap(
	connection: Connection,
	pool: DexPoolConfig,
	poolState: PoolStateService,
	baseSymbol: TokenSymbol,
	quoteSymbol: TokenSymbol
): Promise<void> {
	const accountInfo = await retry(() => connection.getAccountInfo(new PublicKey(pool.poolAddress)));
	if (!accountInfo) throw new Error(`PumpSwap pool account not found: ${pool.poolAddress}`);

	const decoded = decodePumpSwapPool(pool.poolAddress, accountInfo.data as Buffer);
	if (!decoded) throw new Error(`Failed to decode PumpSwap pool: ${pool.poolAddress}`);
	decoded.baseSymbol = baseSymbol;
	decoded.quoteSymbol = quoteSymbol;

	const vaultKeys = [new PublicKey(decoded.baseVault), new PublicKey(decoded.quoteVault)];
	const vaultAccounts = await retry(() => connection.getMultipleAccountsInfo(vaultKeys));

	for (let i = 0; i < vaultKeys.length; i++) {
		const acc = vaultAccounts[i];
		if (!acc) throw new Error(`Vault account not found: ${vaultKeys[i].toBase58()}`);

		const balance = decodeTokenAccountBalance(acc.data as Buffer);
		if (balance === null) throw new Error(`Failed to decode vault: ${vaultKeys[i].toBase58()}`);

		if (i === 0) decoded.baseReserve = balance;
		else decoded.quoteReserve = balance;
	}

	const feeConfigInfo = await retry(() => connection.getAccountInfo(PUMP_FEE_CONFIG));
	let feeTiers: PumpFeeTier[] = [];
	if (feeConfigInfo) {
		feeTiers = decodePumpFeeConfig(feeConfigInfo.data as Buffer);
		if (feeTiers.length > 0) {
			decoded.feeBps = selectFeeTier(feeTiers, decoded.quoteReserve);
		}
	}

	const service = new PumpSwapStateService();
	service.init(decoded, feeTiers, PUMP_FEE_CONFIG.toBase58());
	poolState.register(pool.poolAddress, service);

	log.success(
		`[init] PumpSwap pool loaded: ${pool.poolAddress} (base=${decoded.baseReserve}, quote=${decoded.quoteReserve}, fee=[${decoded.feeBps}], price=${formatPrice(decoded.price, baseSymbol, quoteSymbol)})`
	);
}

async function initMeteora(
	connection: Connection,
	pool: DexPoolConfig,
	poolState: PoolStateService,
	baseSymbol: TokenSymbol,
	quoteSymbol: TokenSymbol
): Promise<void> {
	const accountInfo = await retry(() => connection.getAccountInfo(new PublicKey(pool.poolAddress)));
	if (!accountInfo) throw new Error(`Meteora pool account not found: ${pool.poolAddress}`);

	const decoded = decodeMeteoraPool(pool.poolAddress, accountInfo.data as Buffer);
	if (!decoded) throw new Error(`Failed to decode Meteora pool: ${pool.poolAddress}`);
	decoded.baseSymbol = baseSymbol;
	decoded.quoteSymbol = quoteSymbol;

	const centerIdx = Math.floor(decoded.activeId / BINS_PER_ARRAY);
	const binArrayIndices = [centerIdx - 1, centerIdx, centerIdx + 1];
	const binArrayPDAs = binArrayIndices.map((idx) => deriveBinArrayPDA(pool.poolAddress, idx));

	const binArrayAccounts = await retry(() => connection.getMultipleAccountsInfo(binArrayPDAs));

	const binArrays: { pubkey: string; data: NonNullable<ReturnType<typeof decodeMeteoraBinArray>> }[] = [];
	for (let i = 0; i < binArrayPDAs.length; i++) {
		const acc = binArrayAccounts[i];
		if (!acc) continue;

		const binArray = decodeMeteoraBinArray(acc.data as Buffer);
		if (!binArray) continue;

		binArrays.push({ pubkey: binArrayPDAs[i].toBase58(), data: binArray });
	}

	const service = new MeteoraStateService();
	service.init(decoded, binArrays);
	poolState.register(pool.poolAddress, service);

	log.success(
		`[init] Meteora pool loaded: ${pool.poolAddress} (activeId=${decoded.activeId}, binStep=${decoded.binStep}, arrays=${binArrays.length}, price=${formatPrice(decoded.price, baseSymbol, quoteSymbol)})`
	);
}

function assertNever(value: never): never {
	throw new Error(`Unhandled DEX type: ${value}`);
}
