import { log } from "./logger";

const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 1000;

// Retries an async function with exponential backoff.
// Delays double on each attempt: delay, delay*2, delay*4, ...
export async function retry<T>(
	fn: () => Promise<T>,
	retries: number = DEFAULT_RETRIES,
	delayMs: number = DEFAULT_DELAY_MS
): Promise<T> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (attempt < retries) {
				const backoff = delayMs * 2 ** attempt;
				log.warning(`[retry] Attempt ${attempt + 1}/${retries + 1} failed, retrying in ${backoff}ms`);
				await sleep(backoff);
			}
		}
	}

	throw lastError;
}

export function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatPrice(price: bigint, base: string, quote: string): string {
	return `${(Number(price) / 1e18).toFixed(10)} ${base}/${quote}`;
}
