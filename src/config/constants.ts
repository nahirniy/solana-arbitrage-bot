export const PRECISION = 10n ** 18n;

export const MAX_BIPS = 10_000n;

// PumpFun fee rates from fee program (tier 0: mcap < 420 SOL)
export const PUMPFUN_LP_FEE_BIPS = 2n;
export const PUMPFUN_PROTOCOL_FEE_BIPS = 93n;
export const PUMPFUN_CREATOR_FEE_BIPS = 30n;
export const PUMPFUN_TOTAL_FEE_BIPS = PUMPFUN_LP_FEE_BIPS + PUMPFUN_PROTOCOL_FEE_BIPS + PUMPFUN_CREATOR_FEE_BIPS;

// 1e9 — Meteora DLMM fee precision denominator
export const FEE_PRECISION = 1_000_000_000n;

// Number of bins per DLMM bin array account
export const BINS_PER_ARRAY = 70;

// Fixed input for current phase: 0.01 SOL = 10 000 000 lamports
export const FIXED_TRADE_SIZE_LAMPORTS = 10_000_000n;

// SPL token account data length (bytes)
export const TOKEN_ACCOUNT_SIZE = 165;

import { TokenSymbol } from "../types";

export const TOKEN_DECIMALS: Record<TokenSymbol, number> = {
	[TokenSymbol.WSOL]: 9,
	[TokenSymbol.LIA]: 6
};

// ── Program IDs ──────────────────────────────────────────────────────

export const PUMPFUN_AMM_PROGRAM = "pSwapbiyqMh8U93RzGXzXCjJKHsXq5PsfKVR1AMTBEF";
export const METEORA_DLMM_PROGRAM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

// ── Geyser ───────────────────────────────────────────────────────────

export const RECONNECT_DELAY_MS = 10_000;
export const STALE_STREAM_TIMEOUT_MS = 30_000;
