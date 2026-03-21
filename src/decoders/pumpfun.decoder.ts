import { PublicKey } from "@solana/web3.js";
import { AmmPoolState } from "../types";
import { TokenSymbol } from "../types";

// PumpFun AMM Pool account layout (Anchor program: pSwapbiyqMh8U93RzGXzXCjJKHsXq5PsfKVR1AMTBEF)
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

export function decodePumpFunPool(poolAddress: string, data: Buffer): AmmPoolState | null {
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
		price: 0n
	};
}
