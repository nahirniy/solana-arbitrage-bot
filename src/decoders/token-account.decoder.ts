import { TOKEN_ACCOUNT_SIZE } from "../config";

const AMOUNT_OFFSET = 64;

export function decodeTokenAccountBalance(data: Buffer): bigint | null {
	if (data.length < TOKEN_ACCOUNT_SIZE) return null;
	return data.readBigUInt64LE(AMOUNT_OFFSET);
}
