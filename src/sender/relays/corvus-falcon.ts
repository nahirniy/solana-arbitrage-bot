import { RelayName } from "../../types";
import type { RelayHandler } from "../../types";

const DEFAULT_URL = "http://fra.falcon.wtf";

export class CorvusFalconRelay implements RelayHandler {
	readonly name = RelayName.CORVUS_FALCON;
	private readonly endpoint: string;

	constructor(apiKey: string, baseUrl = DEFAULT_URL) {
		this.endpoint = `${baseUrl}/binary?api-key=${apiKey}`;
	}

	async send(base64Tx: string): Promise<string> {
		const rawBytes = Buffer.from(base64Tx, "base64");

		const response = await fetch(this.endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/octet-stream" },
			body: rawBytes
		});

		if (!response.ok) throw new Error(`Falcon HTTP ${response.status}`);

		return extractSignatureFromTx(rawBytes);
	}
}

function extractSignatureFromTx(rawBytes: Buffer): string {
	const sig = rawBytes.subarray(1, 65);
	const bs58 = require("bs58") as typeof import("bs58");
	return bs58.default.encode(sig);
}
