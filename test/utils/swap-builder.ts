import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { AccountMeta } from "@solana/web3.js";
import type { PumpSwapPoolState, MeteoraPoolState, WalletAccounts } from "../../src/types";
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
	PUMP_SELL_FEE_RECIPIENT_ATA,
	LIA_MINT,
	WSOL_MINT,
	METEORA_PROGRAM,
	MEMO_PROGRAM
} from "../../src/config/program.config";
import { deriveBinArrayPDA } from "../../src/utils";

// Discriminators from DIRECT_SWAPS.md
const PUMP_BUY_DISC = Buffer.from([198, 46, 21, 82, 180, 217, 232, 112]);
const PUMP_SELL_DISC = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
const METEORA_SWAP2_DISC = Buffer.from([65, 75, 63, 76, 235, 91, 91, 136]);

// ── PumpSwap direct swaps ────────────────────────────────────────────

export function buildPumpSwapBuy(
	quoteAmount: bigint,
	walletAccounts: WalletAccounts,
	pumpSwapState: PumpSwapPoolState
): TransactionInstruction {
	// 8 disc + 8 amount + 8 min_out + 1 track_volume = 25 bytes
	const data = Buffer.alloc(25);
	PUMP_BUY_DISC.copy(data, 0);
	data.writeBigUInt64LE(quoteAmount, 8);
	data.writeBigUInt64LE(1n, 16);
	data.writeUInt8(0, 24); // track_volume = OptionBool::None

	const w = walletAccounts;
	const keys: AccountMeta[] = [
		{ pubkey: new PublicKey(pumpSwapState.poolAddress), isSigner: false, isWritable: true },
		{ pubkey: w.wallet, isSigner: true, isWritable: true },
		{ pubkey: PUMP_GLOBAL_CONFIG, isSigner: false, isWritable: false },
		{ pubkey: LIA_MINT, isSigner: false, isWritable: false },
		{ pubkey: WSOL_MINT, isSigner: false, isWritable: false },
		{ pubkey: w.userBaseAta, isSigner: false, isWritable: true },
		{ pubkey: w.userQuoteAta, isSigner: false, isWritable: true },
		{ pubkey: new PublicKey(pumpSwapState.baseVault), isSigner: false, isWritable: true },
		{ pubkey: new PublicKey(pumpSwapState.quoteVault), isSigner: false, isWritable: true },
		{ pubkey: PUMP_BUY_FEE_RECIPIENT, isSigner: false, isWritable: false },
		{ pubkey: PUMP_BUY_FEE_RECIPIENT_ATA, isSigner: false, isWritable: true },
		{ pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
		{ pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
		{ pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: PUMP_COIN_CREATOR_VAULT_ATA, isSigner: false, isWritable: true },
		{ pubkey: PUMP_COIN_CREATOR_VAULT_AUTHORITY, isSigner: false, isWritable: false },
		{ pubkey: PUMP_GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true },
		{ pubkey: w.userVolumeAcc, isSigner: false, isWritable: true },
		{ pubkey: PUMP_FEE_CONFIG, isSigner: false, isWritable: false },
		{ pubkey: PUMP_FEE_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: w.userVolumeAccWsol, isSigner: false, isWritable: true },
		{ pubkey: PUMP_STATIC_ACCOUNT, isSigner: false, isWritable: false }
	];

	return new TransactionInstruction({ programId: PUMP_PROGRAM, keys, data });
}

export function buildPumpSwapSell(
	baseAmount: bigint,
	walletAccounts: WalletAccounts,
	pumpSwapState: PumpSwapPoolState
): TransactionInstruction {
	// 8 disc + 8 amount + 8 min_out = 24 bytes (no track_volume)
	const data = Buffer.alloc(24);
	PUMP_SELL_DISC.copy(data, 0);
	data.writeBigUInt64LE(baseAmount, 8);
	data.writeBigUInt64LE(0n, 16);

	const w = walletAccounts;
	const keys: AccountMeta[] = [
		{ pubkey: new PublicKey(pumpSwapState.poolAddress), isSigner: false, isWritable: true },
		{ pubkey: w.wallet, isSigner: true, isWritable: true },
		{ pubkey: PUMP_GLOBAL_CONFIG, isSigner: false, isWritable: true },
		{ pubkey: LIA_MINT, isSigner: false, isWritable: false },
		{ pubkey: WSOL_MINT, isSigner: false, isWritable: false },
		{ pubkey: w.userBaseAta, isSigner: false, isWritable: true },
		{ pubkey: w.userQuoteAta, isSigner: false, isWritable: true },
		{ pubkey: new PublicKey(pumpSwapState.baseVault), isSigner: false, isWritable: true },
		{ pubkey: new PublicKey(pumpSwapState.quoteVault), isSigner: false, isWritable: true },
		{ pubkey: PUMP_SELL_FEE_RECIPIENT, isSigner: false, isWritable: false },
		{ pubkey: PUMP_SELL_FEE_RECIPIENT_ATA, isSigner: false, isWritable: true },
		{ pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
		{ pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
		{ pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: PUMP_COIN_CREATOR_VAULT_ATA, isSigner: false, isWritable: true },
		{ pubkey: PUMP_COIN_CREATOR_VAULT_AUTHORITY, isSigner: false, isWritable: false },
		{ pubkey: PUMP_FEE_CONFIG, isSigner: false, isWritable: false },
		{ pubkey: PUMP_FEE_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: w.userVolumeAccWsol, isSigner: false, isWritable: true },
		{ pubkey: w.userVolumeAcc, isSigner: false, isWritable: true },
		{ pubkey: PUMP_STATIC_ACCOUNT, isSigner: false, isWritable: false }
	];

	return new TransactionInstruction({ programId: PUMP_PROGRAM, keys, data });
}

// ── Meteora direct swap ─────────────────────────────────────────────

export function buildMeteoraSwap(
	amountIn: bigint,
	swapXtoY: boolean,
	walletAccounts: WalletAccounts,
	meteoraState: MeteoraPoolState
): TransactionInstruction {
	// 8 disc + 8 amount + 8 min_out + 4 remaining_accounts_info
	const data = Buffer.alloc(28);
	METEORA_SWAP2_DISC.copy(data, 0);
	data.writeBigUInt64LE(amountIn, 8);
	data.writeBigUInt64LE(0n, 16);
	// remaining_accounts_info: len=2, TransferHookX(0)=0, TransferHookY(1)=0
	data.writeUInt32LE(2, 24);
	// Already zeroed: accounts_type=0,length=0, accounts_type=0,length=0
	// But accounts_type for Y should be 1
	// Wait, we need 4 more bytes: [type=0, len=0, type=1, len=0]

	// Actually the buffer is 28 bytes but remaining_accounts_info needs 4+4=8 bytes total?
	// From the spec: 4 bytes u32 len=2, then 2 entries of [1 byte type, 1 byte length] = 4 bytes
	// Total remaining_accounts_info = 4+2+2 = 8 bytes
	// So total data = 8+8+8+8 = 32 bytes

	// Let me recalculate properly
	const data2 = Buffer.alloc(32);
	METEORA_SWAP2_DISC.copy(data2, 0);
	data2.writeBigUInt64LE(amountIn, 8);
	data2.writeBigUInt64LE(0n, 16);
	data2.writeUInt32LE(2, 24);  // remaining_accounts_info_len = 2
	data2.writeUInt8(0, 28);     // accounts_type = 0 (TransferHookX)
	data2.writeUInt8(0, 29);     // length = 0
	data2.writeUInt8(1, 30);     // accounts_type = 1 (TransferHookY)
	data2.writeUInt8(0, 31);     // length = 0

	const w = walletAccounts;
	const userTokenIn = swapXtoY ? w.userBaseAta : w.userQuoteAta;
	const userTokenOut = swapXtoY ? w.userQuoteAta : w.userBaseAta;

	const keys: AccountMeta[] = [
		{ pubkey: new PublicKey(meteoraState.poolAddress), isSigner: false, isWritable: true },
		{ pubkey: METEORA_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: new PublicKey(meteoraState.reserveX), isSigner: false, isWritable: true },
		{ pubkey: new PublicKey(meteoraState.reserveY), isSigner: false, isWritable: true },
		{ pubkey: userTokenIn, isSigner: false, isWritable: true },
		{ pubkey: userTokenOut, isSigner: false, isWritable: true },
		{ pubkey: LIA_MINT, isSigner: false, isWritable: false },
		{ pubkey: WSOL_MINT, isSigner: false, isWritable: false },
		{ pubkey: deriveOracle(meteoraState.poolAddress), isSigner: false, isWritable: true },
		{ pubkey: METEORA_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: w.wallet, isSigner: true, isWritable: true },
		{ pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: MEMO_PROGRAM, isSigner: false, isWritable: false },
		{ pubkey: deriveEventAuthority(), isSigner: false, isWritable: false },
		{ pubkey: METEORA_PROGRAM, isSigner: false, isWritable: false }
	];

	const binArrayIndices = Array.from(meteoraState.binArrays.keys()).sort((a, b) => a - b);
	for (const index of binArrayIndices) {
		keys.push({ pubkey: deriveBinArrayPDA(meteoraState.poolAddress, index), isSigner: false, isWritable: true });
	}

	return new TransactionInstruction({ programId: METEORA_PROGRAM, keys, data: data2 });
}

// ── Meteora PDA helpers (cached) ────────────────────────────────────

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
