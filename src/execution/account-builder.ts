import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { AccountMeta } from "@solana/web3.js";
import type { ArbRoute, AnyPoolState, WalletAccounts } from "../types";
import { LIA_MINT, WSOL_MINT } from "../config/program.config";
import { dexAccountProviders } from "../config/accounts";

export function buildExecuteArbAccounts(
	route: ArbRoute,
	poolStates: ReadonlyMap<string, AnyPoolState>,
	walletAccounts: WalletAccounts
): AccountMeta[] {
	const accounts = buildSharedAccounts(walletAccounts);

	for (const [dexType, provider] of dexAccountProviders) {
		const isBuySide = route.buyDex === dexType;
		const poolAddress = isBuySide ? route.buyPoolAddress : route.sellPoolAddress;
		const state = poolStates.get(poolAddress);
		if (!state) throw new Error(`Missing pool state for ${poolAddress}`);

		accounts.push(...provider({ poolState: state, walletAccounts, isBuySide }));
	}

	return accounts;
}

function buildSharedAccounts(w: WalletAccounts): AccountMeta[] {
	return [
		{ pubkey: w.wallet, isSigner: true, isWritable: true },
		{ pubkey: w.operatorPda, isSigner: false, isWritable: false },
		{ pubkey: w.configPda, isSigner: false, isWritable: false },
		{ pubkey: LIA_MINT, isSigner: false, isWritable: false },
		{ pubkey: WSOL_MINT, isSigner: false, isWritable: false },
		{ pubkey: w.userBaseAta, isSigner: false, isWritable: true },
		{ pubkey: w.userQuoteAta, isSigner: false, isWritable: true },
		{ pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
		{ pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
	];
}
