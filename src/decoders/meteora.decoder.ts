import { PublicKey } from "@solana/web3.js";
import { BINS_PER_ARRAY } from "../config";
import { DlmmPoolState, DlmmFeeParams, DlmmBinArray, DlmmBin, TokenSymbol } from "../types";

// ── Meteora DLMM Pool (LbPair) account layout ───────────────────────
// Offset  Size  Field
//  0       8    discriminator
//  8      32    StaticParameters
// 40      32    VariableParameters
// 72       1    bump_seed
// 73       2    bin_step_seed
// 75       1    pair_type
// 76       4    active_id (i32)
// 80       2    bin_step (u16)
// 82       6    status + padding
// 88      32    token_x_mint
// 120     32    token_y_mint
// 152     32    reserve_x (vault pubkey)
// 184     32    reserve_y (vault pubkey)

const POOL_MIN_SIZE = 216;

const SP_BASE_FACTOR = 8;
const SP_VARIABLE_FEE_CONTROL = 16;
const SP_MAX_VOL_ACCUMULATOR = 20;

const VP_VOL_ACCUMULATOR = 40;
const VP_VOL_REFERENCE = 44;

const ACTIVE_ID_OFFSET = 76;
const BIN_STEP_OFFSET = 80;
const TOKEN_X_MINT_OFFSET = 88;
const TOKEN_Y_MINT_OFFSET = 120;
const RESERVE_X_OFFSET = 152;
const RESERVE_Y_OFFSET = 184;

function readPubkey(data: Buffer, offset: number): string {
	return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

export function decodeMeteoraPool(poolAddress: string, data: Buffer): DlmmPoolState | null {
	if (data.length < POOL_MIN_SIZE) return null;

	const feeParams: DlmmFeeParams = {
		baseFactor: data.readUInt16LE(SP_BASE_FACTOR),
		variableFeeControl: data.readUInt32LE(SP_VARIABLE_FEE_CONTROL),
		maxVolatilityAccumulator: data.readUInt32LE(SP_MAX_VOL_ACCUMULATOR),
		volatilityAccumulator: data.readUInt32LE(VP_VOL_ACCUMULATOR),
		volatilityReference: data.readUInt32LE(VP_VOL_REFERENCE)
	};

	return {
		poolAddress,
		activeId: data.readInt32LE(ACTIVE_ID_OFFSET),
		binStep: data.readUInt16LE(BIN_STEP_OFFSET),
		tokenXMint: readPubkey(data, TOKEN_X_MINT_OFFSET),
		tokenYMint: readPubkey(data, TOKEN_Y_MINT_OFFSET),
		reserveX: readPubkey(data, RESERVE_X_OFFSET),
		reserveY: readPubkey(data, RESERVE_Y_OFFSET),
		baseSymbol: "" as TokenSymbol,
		quoteSymbol: "" as TokenSymbol,
		feeParams,
		binArrays: new Map(),
		price: 0n
	};
}

// ── BinArray account layout ──────────────────────────────────────────
// Offset  Size   Field
//  0       8     discriminator
//  8       8     index (i64)
// 16       1     version
// 17       7     padding
// 24      32     pool pubkey
// 56      ...    bins[70], each 144 bytes
//
// Per bin (144 bytes):
// +0      16     amount_x (u128)
// +16     16     amount_y (u128)
// +32     112    remaining fields (not needed for swap math)

const BIN_ARRAY_HEADER_SIZE = 56;
const BIN_SIZE = 144;
const BIN_ARRAY_MIN_SIZE = BIN_ARRAY_HEADER_SIZE + BINS_PER_ARRAY * BIN_SIZE;

function readU128LE(buf: Buffer, offset: number): bigint {
	const low = buf.readBigUInt64LE(offset);
	const high = buf.readBigUInt64LE(offset + 8);
	return low + (high << 64n);
}

export function decodeMeteoraBinArray(data: Buffer): DlmmBinArray | null {
	if (data.length < BIN_ARRAY_MIN_SIZE) return null;

	const index = Number(data.readBigInt64LE(8));
	const lbPair = readPubkey(data, 24);

	const bins: DlmmBin[] = [];
	for (let i = 0; i < BINS_PER_ARRAY; i++) {
		const binOffset = BIN_ARRAY_HEADER_SIZE + i * BIN_SIZE;
		const amountX = readU128LE(data, binOffset);
		const amountY = readU128LE(data, binOffset + 16);

		if (amountX > 0n || amountY > 0n) {
			bins.push({ id: index * BINS_PER_ARRAY + i, amountX, amountY });
		}
	}

	return { index, lbPair, bins };
}
