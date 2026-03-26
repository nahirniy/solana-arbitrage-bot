import { RelayName } from "../../types";
import type { RelayHandler } from "../../types";

const DEFAULT_URL = "http://ny.gateway.astralane.io";

export class AstralaneRelay implements RelayHandler {
	readonly name = RelayName.ASTRALANE;
	private readonly endpoint: string;

	constructor(apiKey: string, baseUrl = DEFAULT_URL) {
		this.endpoint = `${baseUrl}/irisb?api-key=${apiKey}&method=sendTransaction&mev-protect=true`;
	}

	async send(base64Tx: string): Promise<string> {
		const rawBytes = Buffer.from(base64Tx, "base64");

		const response = await fetch(this.endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/octet-stream" },
			body: rawBytes
		});

		if (!response.ok) throw new Error(`Astralane HTTP ${response.status}`);

		// Astralane doesn't return hash in body — extract from tx signatures
		return extractSignatureFromTx(rawBytes);
	}
}

function extractSignatureFromTx(rawBytes: Buffer): string {
	// VersionedTransaction: first byte = signature count, then 64-byte signatures
	const sigCount = rawBytes[0];
	if (sigCount < 1) throw new Error("No signatures in transaction");
	const sig = rawBytes.subarray(1, 65);
	const bs58 = require("bs58") as typeof import("bs58");
	return bs58.default.encode(sig);
}
