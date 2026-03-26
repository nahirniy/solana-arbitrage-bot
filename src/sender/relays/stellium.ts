import { RelayName } from "../../types";
import type { RelayHandler } from "../../types";

const DEFAULT_URL = "http://ewr1.flashrpc.com";

export class StelliumRelay implements RelayHandler {
	readonly name = RelayName.STELLIUM;
	private readonly endpoint: string;

	constructor(apiKey: string, baseUrl = DEFAULT_URL) {
		this.endpoint = `${baseUrl}/${apiKey}`;
	}

	async send(base64Tx: string): Promise<string> {
		const response = await fetch(this.endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "sendTransaction",
				params: [base64Tx, { encoding: "base64" }]
			})
		});

		const json = (await response.json()) as { result?: string; error?: { message: string } };
		if (json.error) throw new Error(json.error.message);
		return json.result!;
	}
}
