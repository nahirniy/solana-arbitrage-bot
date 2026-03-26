import { RelayName } from "../../types";
import type { RelayHandler } from "../../types";

const DEFAULT_URL = "http://ash1.0slot.trade";

export class Slot0Relay implements RelayHandler {
	readonly name = RelayName.SLOT0;
	private readonly endpoint: string;

	constructor(apiKey: string, baseUrl = DEFAULT_URL) {
		this.endpoint = `${baseUrl}/txb?api-key=${apiKey}&anti-mev=true`;
	}

	async send(base64Tx: string): Promise<string> {
		const rawBytes = Buffer.from(base64Tx, "base64");

		const response = await fetch(this.endpoint, {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body: rawBytes
		});

		if (!response.ok) throw new Error(`Slot0 HTTP ${response.status}`);

		return extractSignatureFromTx(rawBytes);
	}
}

function extractSignatureFromTx(rawBytes: Buffer): string {
	const sig = rawBytes.subarray(1, 65);
	const bs58 = require("bs58") as typeof import("bs58");
	return bs58.default.encode(sig);
}
