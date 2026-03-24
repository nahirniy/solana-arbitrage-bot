import { PublicKey } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import type { DlmmPoolState, DexAccountsContext } from "../../types";
import { BINS_PER_ARRAY } from "..";
import { METEORA_PROGRAM, MEMO_PROGRAM } from "../program.config";
import { deriveBinArrayPDA } from "../../utils";

export function getMeteoraAccounts({ poolState }: DexAccountsContext): AccountMeta[] {
	const state = poolState as DlmmPoolState;

	const accounts: AccountMeta[] = [
		{ pubkey: new PublicKey(state.poolAddress), isSigner: false, isWritable: true },
		{ pubkey: deriveBitmapExtension(state.poolAddress), isSigner: false, isWritable: false },
		{ pubkey: new PublicKey(state.reserveX), isSigner: false, isWritable: true },
		{ pubkey: new PublicKey(state.reserveY), isSigner: false, isWritable: true },
		{ pubkey: deriveOracle(state.poolAddress), isSigner: false, isWritable: true },
		{ pubkey: METEORA_PROGRAM, isSigner: false, isWritable: true },
		{ pubkey: deriveEventAuthority(), isSigner: false, isWritable: false },
		{ pubkey: MEMO_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: METEORA_PROGRAM, isSigner: false, isWritable: false }
	];

	const centerIdx = Math.floor(state.activeId / BINS_PER_ARRAY);
	for (let i = centerIdx - 1; i <= centerIdx + 1; i++) {
		accounts.push({ pubkey: deriveBinArrayPDA(state.poolAddress, i), isSigner: false, isWritable: true });
	}

	return accounts;
}

// ── Meteora PDA derivation (cached) ─────────────────────────────────

const oracleCache = new Map<string, PublicKey>();
function deriveOracle(lbPairAddress: string): PublicKey {
	let cached = oracleCache.get(lbPairAddress);
	if (cached) return cached;

	const [pda] = PublicKey.findProgramAddressSync(
		[Buffer.from("oracle"), new PublicKey(lbPairAddress).toBuffer()],
		METEORA_PROGRAM
	);
	oracleCache.set(lbPairAddress, pda);
	return pda;
}

const bitmapCache = new Map<string, PublicKey>();
function deriveBitmapExtension(lbPairAddress: string): PublicKey {
	let cached = bitmapCache.get(lbPairAddress);
	if (cached) return cached;

	const [pda] = PublicKey.findProgramAddressSync(
		[Buffer.from("bitmap"), new PublicKey(lbPairAddress).toBuffer()],
		METEORA_PROGRAM
	);
	bitmapCache.set(lbPairAddress, pda);
	return pda;
}

let eventAuthority: PublicKey | null = null;
function deriveEventAuthority(): PublicKey {
	if (eventAuthority) return eventAuthority;

	const [pda] = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], METEORA_PROGRAM);
	eventAuthority = pda;
	return pda;
}
