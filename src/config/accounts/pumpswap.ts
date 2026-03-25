import { PublicKey } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import type { PumpSwapPoolState, DexAccountsContext } from "../../types";
import {
	PUMP_PROGRAM,
	PUMP_FEE_PROGRAM,
	PUMP_GLOBAL_CONFIG,
	PUMP_EVENT_AUTHORITY,
	PUMP_COIN_CREATOR_VAULT_ATA,
	PUMP_COIN_CREATOR_VAULT_AUTHORITY,
	PUMP_FEE_CONFIG,
	PUMP_STATIC_ACCOUNT,
	PUMP_GLOBAL_VOLUME_ACCUMULATOR,
	PUMP_BUY_FEE_RECIPIENT,
	PUMP_BUY_FEE_RECIPIENT_ATA,
	PUMP_SELL_FEE_RECIPIENT,
	PUMP_SELL_FEE_RECIPIENT_ATA
} from "../program.config";

export function getPumpSwapAccounts({ poolState, walletAccounts, isBuySide }: DexAccountsContext): AccountMeta[] {
	const state = poolState as PumpSwapPoolState;

	return [
		{ pubkey: new PublicKey(state.poolAddress), isSigner: false, isWritable: true },
		{ pubkey: PUMP_GLOBAL_CONFIG, isSigner: false, isWritable: true },
		{ pubkey: new PublicKey(state.baseVault), isSigner: false, isWritable: true },
		{ pubkey: new PublicKey(state.quoteVault), isSigner: false, isWritable: true },
		{
			pubkey: isBuySide ? PUMP_BUY_FEE_RECIPIENT : PUMP_SELL_FEE_RECIPIENT,
			isSigner: false,
			isWritable: false
		},
		{
			pubkey: isBuySide ? PUMP_BUY_FEE_RECIPIENT_ATA : PUMP_SELL_FEE_RECIPIENT_ATA,
			isSigner: false,
			isWritable: true
		},
		{ pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
		{ pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: PUMP_COIN_CREATOR_VAULT_ATA, isSigner: false, isWritable: true },
		{ pubkey: PUMP_COIN_CREATOR_VAULT_AUTHORITY, isSigner: false, isWritable: false },
		{ pubkey: PUMP_GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true },
		{ pubkey: walletAccounts.userVolumeAcc, isSigner: false, isWritable: true },
		{ pubkey: PUMP_FEE_CONFIG, isSigner: false, isWritable: false },
		{ pubkey: PUMP_FEE_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: walletAccounts.userVolumeAccWsol, isSigner: false, isWritable: true },
		{
			pubkey: isBuySide ? PUMP_STATIC_ACCOUNT : walletAccounts.userVolumeAcc,
			isSigner: false,
			isWritable: true
		},
		{ pubkey: PUMP_STATIC_ACCOUNT, isSigner: false, isWritable: false }
	];
}
