import type { AddressLookupTableAccount, Keypair, TransactionInstruction } from "@solana/web3.js";

export enum RelayName {
	HELIUS_JITO = "HELIUS_JITO",
	BLOCK_RAZOR = "BLOCK_RAZOR",
	ASTRALANE = "ASTRALANE",
	STELLIUM = "STELLIUM",
	SLOT0 = "SLOT0",
	CORVUS_FALCON = "CORVUS_FALCON",
	PUBLIC_RPC = "PUBLIC_RPC"
}

export interface RelayResult {
	readonly hash: string;
	readonly relay: RelayName;
}

export interface SendParams {
	readonly instructions: TransactionInstruction[];
	readonly wallet: Keypair;
	readonly nonce: string;
	readonly tipLamports: number;
	readonly luts?: AddressLookupTableAccount[];
}

export interface RelayHandler {
	readonly name: RelayName;
	send(serializedTx: string): Promise<string>;
}
