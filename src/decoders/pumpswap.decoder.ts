import { PublicKey } from "@solana/web3.js";
import type { PumpSwapPoolState, PumpFeeTier } from "../types";
import { TokenSymbol } from "../types";

// PumpSwap AMM Pool account layout (Anchor program: pSwapbiyqMh8U93RzGXzXCjJKHsXq5PsfKVR1AMTBEF)
// Offset  Size  Field
//  0       8    discriminator
//  8       1    pool_bump
//  9       2    index
// 11      32    creator
// 43      32    base_mint
// 75      32    quote_mint
// 107     32    lp_mint
// 139     32    pool_base_token_account (base vault)
// 171     32    pool_quote_token_account (quote vault)
// 203      8    lp_supply

const MIN_ACCOUNT_SIZE = 211;

const OFFSET_BASE_MINT = 43;
const OFFSET_QUOTE_MINT = 75;
const OFFSET_BASE_VAULT = 139;
const OFFSET_QUOTE_VAULT = 171;

function readPubkey(data: Buffer, offset: number): string {
	return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

export function decodePumpSwapPool(poolAddress: string, data: Buffer): PumpSwapPoolState | null {
	if (data.length < MIN_ACCOUNT_SIZE) return null;

	return {
		poolAddress,
		baseMint: readPubkey(data, OFFSET_BASE_MINT),
		quoteMint: readPubkey(data, OFFSET_QUOTE_MINT),
		baseVault: readPubkey(data, OFFSET_BASE_VAULT),
		quoteVault: readPubkey(data, OFFSET_QUOTE_VAULT),
		baseSymbol: "" as TokenSymbol,
		quoteSymbol: "" as TokenSymbol,
		baseReserve: 0n,
		quoteReserve: 0n,
		price: 0n,
		feeBps: [2n, 93n, 30n]
	};
}

// FeeConfig account layout (program: pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ)
// Offset  Size  Field
//  0       8    discriminator
//  8       1    bump
//  9      32    admin
// 41      24    flat_fees (3 × u64: lp, protocol, creator)
// 65       4    fee_tiers length (u32)
// 69      40*N  fee_tiers (each: u128 threshold + 3 × u64 fees)

const FEE_CONFIG_HEADER = 69;
const FEE_TIER_SIZE = 40;

export function decodePumpFeeConfig(data: Buffer): PumpFeeTier[] {
	if (data.length < FEE_CONFIG_HEADER) return [];

	const tierCount = data.readUInt32LE(65);
	const tiers: PumpFeeTier[] = [];

	for (let i = 0; i < tierCount; i++) {
		const off = FEE_CONFIG_HEADER + i * FEE_TIER_SIZE;
		if (off + FEE_TIER_SIZE > data.length) break;

		const thresholdLo = data.readBigUInt64LE(off);
		const thresholdHi = data.readBigUInt64LE(off + 8);
		const thresholdLamports = thresholdLo + (thresholdHi << 64n);

		tiers.push({
			thresholdLamports,
			lpBps: data.readBigUInt64LE(off + 16),
			protocolBps: data.readBigUInt64LE(off + 24),
			creatorBps: data.readBigUInt64LE(off + 32)
		});
	}

	return tiers;
}

// Market cap for AMM pool: quoteReserve * 2 (50/50 constant product)
export function selectFeeTier(tiers: readonly PumpFeeTier[], quoteReserve: bigint): readonly bigint[] {
	const marketCap = quoteReserve * 2n;
	let selected = tiers[0];

	for (const tier of tiers) {
		if (marketCap >= tier.thresholdLamports) {
			selected = tier;
		}
	}

	return [selected.lpBps, selected.protocolBps, selected.creatorBps];
}
