import type { PublicKey, AccountMeta } from "@solana/web3.js";
import type { AnyPoolState } from "./pool-state.types";

export interface WalletAccounts {
	readonly wallet: PublicKey;
	readonly userBaseAta: PublicKey;
	readonly userQuoteAta: PublicKey;
	readonly userVolumeAcc: PublicKey;
	readonly userVolumeAccWsol: PublicKey;
	readonly configPda: PublicKey;
	readonly operatorPda: PublicKey;
}

export interface DexAccountsContext {
	readonly poolState: AnyPoolState;
	readonly walletAccounts: WalletAccounts;
	readonly isBuySide: boolean;
}

export type DexAccountsProvider = (ctx: DexAccountsContext) => AccountMeta[];
