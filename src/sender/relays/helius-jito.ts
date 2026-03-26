import { RelayName } from "../../types";
import type { RelayHandler } from "../../types";

export class HeliusJitoRelay implements RelayHandler {
	readonly name = RelayName.HELIUS_JITO;

	constructor(private readonly rpcUrl: string) {}

	async send(base64Tx: string): Promise<string> {
		const response = await fetch(this.rpcUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "sendTransaction",
				params: [base64Tx, { encoding: "base64", skipPreflight: true, maxRetries: 0 }]
			})
		});

		const json = (await response.json()) as { result?: string; error?: { message: string } };
		if (json.error) throw new Error(json.error.message);
		return json.result!;
	}
}
