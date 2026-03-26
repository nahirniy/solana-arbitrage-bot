export const PRECISION = 10n ** 18n;

export const MAX_BIPS = 10_000n;

// 1e9 — Meteora Meteora fee precision denominator
export const FEE_PRECISION = 1_000_000_000n;

// Number of bins per Meteora bin array account
export const BINS_PER_ARRAY = 70;

// Fixed input for current phase: 0.01 SOL = 10 000 000 lamports
export const FIXED_TRADE_SIZE_LAMPORTS = 1_00_000n;

// SPL token account data length (bytes)
export const TOKEN_ACCOUNT_SIZE = 165;

import { TokenSymbol } from "../types";

export const TOKEN_DECIMALS: Record<TokenSymbol, number> = {
	[TokenSymbol.WSOL]: 9,
	[TokenSymbol.LIA]: 6
};

// ── Program IDs ──────────────────────────────────────────────────────

export const PUMPSWAP_PROGRAM = "pSwapbiyqMh8U93RzGXzXCjJKHsXq5PsfKVR1AMTBEF";
export const METEORA_PROGRAM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

// ── PumpSwap ─────────────────────────────────────────────────────────

export const FEE_CONFIG_UPDATE_INTERVAL_MS = 3_600_000; // 1 hour

// ── Execution ────────────────────────────────────────────────────────

export const TIP_PERCENT = 10; // % of profit sent as validator tip
export const MIN_TIP_LAMPORTS = 1_000_000; // 0.001 SOL — minimum tip for relays
export const MIN_PROFIT_LAMPORTS = 0n; // minimum profit to execute arb

// ── Geyser ───────────────────────────────────────────────────────────

export const RECONNECT_DELAY_MS = 10_000;
export const STALE_STREAM_TIMEOUT_MS = 30_000;
