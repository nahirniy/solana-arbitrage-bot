import { PublicKey } from "@solana/web3.js";

// ── Arbitrage Program ───────────────────────────────────────────────

export const ARB_PROGRAM = new PublicKey("An3HM7PCKigYDszLj8iWYK7mWRnnnhECfM2tRZwsBFV9");

// ── Token Mints ─────────────────────────────────────────────────────

export const LIA_MINT = new PublicKey("79dGFnR8XUusyDiK3n8yZ6FXhJjWLFgzdsi2SkUpump");
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// ── PumpFun AMM ─────────────────────────────────────────────────────

export const PUMP_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const PUMP_FEE_PROGRAM = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
export const PUMP_GLOBAL_CONFIG = new PublicKey("ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw");
export const PUMP_EVENT_AUTHORITY = new PublicKey("GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR");
export const PUMP_COIN_CREATOR_VAULT_ATA = new PublicKey("FXxLh8XggMMAwYaioDvVbqd2NAM6P3qANj1Sgv1mR9U1");
export const PUMP_COIN_CREATOR_VAULT_AUTHORITY = new PublicKey("AWyhZXmWi4rpymebxphjbboJ72nBrq2TVXBALD7At1fN");
export const PUMP_FEE_CONFIG = new PublicKey("5PHirr8joyTMp9JMm6nW7hNDVyEYdkzDqazxPD7RaTjx");
export const PUMP_STATIC_ACCOUNT = new PublicKey("5c829Q6nZGDrD7Pfv2xFh5pMigfaoUgTGbbt1Z2t1FjY");
export const PUMP_GLOBAL_VOLUME_ACCUMULATOR = new PublicKey("C2aFPdENg4A2HQsmrd5rTw5TaYBX5Ku887cWjbFKtZpw");

// PumpFun buy vs sell use different fee recipients
export const PUMP_BUY_FEE_RECIPIENT = new PublicKey("JCRGumoE9Qi5BBgULTgdgTLjSgkCMSbF62ZZfGs84JeU");
export const PUMP_BUY_FEE_RECIPIENT_ATA = new PublicKey("DWpvfqzGWuVy9jVSKSShdM2733nrEsnnhsUStYbkj6Nn");
export const PUMP_SELL_FEE_RECIPIENT = new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");
export const PUMP_SELL_FEE_RECIPIENT_ATA = new PublicKey("94qWNrtmfn42h3ZjUZwWvK1MEo9uVmmrBPd2hpNjYDjb");

// ── Meteora DLMM ────────────────────────────────────────────────────

export const METEORA_PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
