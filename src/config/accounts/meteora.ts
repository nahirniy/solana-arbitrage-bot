import { PublicKey } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import type { MeteoraPoolState, DexAccountsContext } from "../../types";
import { METEORA_PROGRAM, MEMO_PROGRAM } from "../program.config";
import { deriveBinArrayPDA } from "../../utils";

export function getMeteoraAccounts({ poolState }: DexAccountsContext): AccountMeta[] {
	const state = poolState as MeteoraPoolState;

	const accounts: AccountMeta[] = [
		{ pubkey: new PublicKey(state.poolAddress), isSigner: false, isWritable: true },
		{ pubkey: METEORA_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: new PublicKey(state.reserveX), isSigner: false, isWritable: true },
		{ pubkey: new PublicKey(state.reserveY), isSigner: false, isWritable: true },
		{ pubkey: deriveOracle(state.poolAddress), isSigner: false, isWritable: true },
		{ pubkey: METEORA_PROGRAM, isSigner: false, isWritable: true },
		{ pubkey: deriveEventAuthority(), isSigner: false, isWritable: false },
		{ pubkey: MEMO_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: METEORA_PROGRAM, isSigner: false, isWritable: false }
	];

	const binArrayIndices = Array.from(state.binArrays.keys()).sort((a, b) => a - b);
	for (const index of binArrayIndices) {
		accounts.push({ pubkey: deriveBinArrayPDA(state.poolAddress, index), isSigner: false, isWritable: true });
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


let eventAuthority: PublicKey | null = null;
function deriveEventAuthority(): PublicKey {
	if (eventAuthority) return eventAuthority;

	const [pda] = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], METEORA_PROGRAM);
	eventAuthority = pda;
	return pda;
}
