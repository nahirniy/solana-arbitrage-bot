import {
	PublicKey,
	SystemProgram,
	TransactionMessage,
	TransactionInstruction,
	VersionedTransaction
} from "@solana/web3.js";
import { createHash } from "crypto";
import type { AccountMeta, AddressLookupTableAccount } from "@solana/web3.js";
import type { ArbRoute } from "../types";
import { DexType } from "../types";
import { ARB_PROGRAM, LIA_MINT, WSOL_MINT } from "../config/program.config";

const EXECUTE_ARB_DISCRIMINATOR = createHash("sha256").update("global:execute_arb").digest().subarray(0, 8);

const ONCHAIN_DEX_PUMPFUN = 0;
const ONCHAIN_DEX_METEORA = 1;

export function buildArbTransaction(
	accounts: AccountMeta[],
	route: ArbRoute,
	amountIn: bigint,
	nonceAddress: PublicKey,
	nonceValue: string,
	wallet: PublicKey,
	lut: AddressLookupTableAccount
): VersionedTransaction {
	const nonceAdvanceIx = SystemProgram.nonceAdvance({
		noncePubkey: nonceAddress,
		authorizedPubkey: wallet
	});

	const executeArbIx = new TransactionInstruction({
		programId: ARB_PROGRAM,
		keys: accounts,
		data: serializeExecuteArbData(route, amountIn)
	});

	const message = new TransactionMessage({
		payerKey: wallet,
		recentBlockhash: nonceValue,
		instructions: [nonceAdvanceIx, executeArbIx]
	}).compileToV0Message([lut]);

	return new VersionedTransaction(message);
}

// Anchor instruction data: [8-byte discriminator][borsh-serialized args]
// Args: routes: Vec<Route>, amount_in: u64
// Route: { dex: u8, token_in: Pubkey(32), token_out: Pubkey(32) } = 65 bytes
function serializeExecuteArbData(route: ArbRoute, amountIn: bigint): Buffer {
	const routeCount = 2;
	const buf = Buffer.alloc(8 + 4 + routeCount * 65 + 8);
	let offset = 0;

	EXECUTE_ARB_DISCRIMINATOR.copy(buf, offset);
	offset += 8;

	buf.writeUInt32LE(routeCount, offset);
	offset += 4;

	// Leg 1: buy (SOL → LIA)
	buf.writeUInt8(toOnChainDex(route.buyDex), offset);
	offset += 1;
	WSOL_MINT.toBuffer().copy(buf, offset);
	offset += 32;
	LIA_MINT.toBuffer().copy(buf, offset);
	offset += 32;

	// Leg 2: sell (LIA → SOL)
	buf.writeUInt8(toOnChainDex(route.sellDex), offset);
	offset += 1;
	LIA_MINT.toBuffer().copy(buf, offset);
	offset += 32;
	WSOL_MINT.toBuffer().copy(buf, offset);
	offset += 32;

	buf.writeBigUInt64LE(amountIn, offset);

	return buf;
}

function toOnChainDex(dex: DexType): number {
	switch (dex) {
		case DexType.PUMPFUN_AMM:
			return ONCHAIN_DEX_PUMPFUN;
		case DexType.METEORA_DLMM:
			return ONCHAIN_DEX_METEORA;
	}
}
