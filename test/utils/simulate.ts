import { Connection, Keypair, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { decodeTokenAccountBalance } from "../../src/decoders";

export async function simulateSwapAndGetDelta(
	connection: Connection,
	keypair: Keypair,
	instruction: TransactionInstruction,
	targetAta: PublicKey
): Promise<bigint> {
	const beforeInfo = await connection.getAccountInfo(targetAta);
	const before = beforeInfo ? decodeTokenAccountBalance(beforeInfo.data as Buffer) ?? 0n : 0n;

	const { blockhash } = await connection.getLatestBlockhash();
	const message = new TransactionMessage({
		payerKey: keypair.publicKey,
		recentBlockhash: blockhash,
		instructions: [instruction]
	}).compileToV0Message();

	const tx = new VersionedTransaction(message);
	tx.sign([keypair]);

	const result = await connection.simulateTransaction(tx, {
		sigVerify: false,
		replaceRecentBlockhash: true,
		accounts: {
			encoding: "base64" as const,
			addresses: [targetAta.toBase58()]
		}
	});

	if (result.value.err) {
		const logs = result.value.logs?.filter((l) => l.includes("Program log:") || l.includes("failed")) ?? [];
		throw new Error(`Simulation failed: ${JSON.stringify(result.value.err)}\n${logs.join("\n")}`);
	}

	let after = 0n;
	if (result.value.accounts?.[0]?.data) {
		const data = Buffer.from(result.value.accounts[0].data[0], "base64");
		after = decodeTokenAccountBalance(data) ?? 0n;
	}

	return after - before;
}

export async function getTokenBalance(connection: Connection, ata: PublicKey): Promise<bigint> {
	const info = await connection.getAccountInfo(ata);
	if (!info) return 0n;
	return decodeTokenAccountBalance(info.data as Buffer) ?? 0n;
}
