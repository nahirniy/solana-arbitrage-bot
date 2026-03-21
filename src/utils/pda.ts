import { PublicKey } from "@solana/web3.js";
import { METEORA_DLMM_PROGRAM } from "../config";

const cache = new Map<string, PublicKey>();

// Derives the on-chain address of a Meteora DLMM bin array account.
// Each bin array holds 70 bins; binArrayIndex determines which chunk.
export function deriveBinArrayPDA(poolAddress: string, binArrayIndex: number): PublicKey {
	const cacheKey = `${poolAddress}:${binArrayIndex}`;
	const existing = cache.get(cacheKey);
	if (existing) return existing;

	const indexBuf = Buffer.alloc(8);
	indexBuf.writeBigInt64LE(BigInt(binArrayIndex));

	const [pda] = PublicKey.findProgramAddressSync(
		[Buffer.from("bin_array"), new PublicKey(poolAddress).toBuffer(), indexBuf],
		new PublicKey(METEORA_DLMM_PROGRAM)
	);

	cache.set(cacheKey, pda);
	return pda;
}
