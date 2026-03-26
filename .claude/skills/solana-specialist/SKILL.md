---
name: solana-specialist
description: Deep Solana blockchain expertise — account model, program architecture, DeFi protocol internals, on-chain data decoding, Geyser streaming, transaction mechanics. Activated when working with Solana-specific code, decoders, RPC, or Geyser.
---

# Solana Blockchain Specialist

## Account model

Solana programs don't store state internally. All state lives in accounts — separate data buffers owned by programs. Every account has:
- `data` — raw bytes, layout defined by the owning program
- `owner` — the program that can modify this account
- `lamports` — SOL balance (1 SOL = 1e9 lamports)

Anchor programs prefix every account with an 8-byte discriminator (SHA256 hash of the account type name). Always validate the discriminator before decoding.

When decoding any account:
1. Check minimum buffer length first
2. Validate discriminator if Anchor program
3. Read fields at exact byte offsets using little-endian
4. Return null on any mismatch — never throw from a decoder

## Data types and byte layout

Solana on-chain data is little-endian. Common types:
- `u8` — 1 byte
- `u16` — 2 bytes, `readUInt16LE`
- `i32` — 4 bytes, `readInt32LE`
- `u32` — 4 bytes, `readUInt32LE`
- `u64` — 8 bytes, `readBigUInt64LE`
- `i64` — 8 bytes, `readBigInt64LE`
- `u128` — 16 bytes, read as two u64 (low + high << 64n)
- `Pubkey` — 32 bytes, raw bytes → `new PublicKey(buffer.subarray(offset, offset + 32))`
- `bool` — 1 byte (0 = false, nonzero = true)

For u128 reading:
```typescript
function readU128LE(buf: Buffer, offset: number): bigint {
    const low = buf.readBigUInt64LE(offset);
    const high = buf.readBigUInt64LE(offset + 8);
    return low + (high << 64n);
}
```

## SPL Token accounts

Standard SPL token account is exactly 165 bytes:
- Offset 0: mint (32 bytes, Pubkey)
- Offset 32: owner (32 bytes, Pubkey)
- Offset 64: amount (8 bytes, u64) ← the balance
- Offset 72: delegate option (4 bytes)
- Offset 76: delegate (32 bytes)
- Offset 108: state (1 byte)
- Remaining: close authority, etc.

The amount at offset 64 is the only field needed for reserve tracking.

## PDA derivation

Program Derived Addresses are deterministic — same seeds always give same address. Cache them.

```typescript
const [pda] = PublicKey.findProgramAddressSync(seeds, programId);
```

Seeds are byte arrays. Common patterns:
- String seed: `Buffer.from("seed_string")`
- Pubkey seed: `pubkey.toBuffer()`
- Numeric seed (i64 LE): `Buffer` with `writeBigInt64LE`

Finding PDAs is CPU-intensive (iterates bump values). Always cache the result — PDAs never change.

## PumpSwap protocol

Program ID: `pSwapbiyqMh8U93RzGXzXCjJKHsXq5PsfKVR1AMTBEF`

Constant product AMM (x * y = k) with non-standard fee handling.

Pool account stores metadata — vault addresses, mints, LP supply. Reserves are NOT in the pool account. They live in two separate SPL token vault accounts.

**Buy (SOL → Token):** fees deducted from INPUT before swap. Each fee component (LP, protocol, creator) ceil-rounded independently. Pool also applies -1 lamport safety margin. Formula: `effectiveIn = floor(input * 10000 / (10000 + totalBps))`, adjust for ceil overflow, subtract 1, then pure x*y=k.

**Sell (Token → SOL):** swap first, then fees from OUTPUT. Each fee ceil-rounded from grossOut. No -1 safety margin.

**Fee tiers:** dynamic, tiered by market cap (25 tiers from 125 bps at <420 SOL to 30 bps at >98K SOL). Stored in FeeConfig account of fee program (`pfeeUxB6...`). Loaded at startup, Geyser-subscribed.

**Key insight:** sum of 3 individual ceil fees ≠ ceil of total. Must compute each separately.

## Meteora DLMM protocol

Program ID: `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`

Discrete liquidity bins — each bin is a constant-sum market at a fixed price.

### LbPair account (main pool)
Contains: activeId (current price bin), binStep (spacing between bins), fee parameters (base factor, variable fee control, volatility accumulator), token mints, vault pubkeys.

Layout is large (~900+ bytes) with nested structs:
- StaticParameters (32 bytes): baseFactor, filterPeriod, decayPeriod, reductionFactor, variableFeeControl, maxVolatilityAccumulator
- VariableParameters (32 bytes): volatilityAccumulator, volatilityReference, indexReference, lastUpdateTimestamp
- Then: activeId (i32), binStep (u16), token mints, vault pubkeys, protocol fees, etc.

### BinArray accounts
Each holds 70 bins. Total account size: ~10136 bytes. Each bin is 144 bytes:
- amountX (u128, 16 bytes) — token X liquidity
- amountY (u128, 16 bytes) — token Y liquidity
- Remaining 112 bytes: liquiditySupply, rewards, fee tracking (not needed for swap math)

Bin ID calculation:
- `binArrayIndex = Math.floor(binId / 70)` (signed integer division)
- `binId = binArrayIndex * 70 + positionInArray`

Bin array PDA: `findProgramAddressSync(["bin_array", lbPairPubkey, i64LE(binArrayIndex)], DLMM_PROGRAM)`

### Bin price formula
`price(binId) = (1 + binStep / 10000) ^ (binId - 8388608)`

The exponent can be large. Use binary exponentiation with PRECISION (1e18) scaling:
- base = PRECISION + binStep * PRECISION / 10000
- Positive exponent: repeated squaring, dividing by PRECISION at each step
- Negative exponent: compute positive, then PRECISION² / result

### Fee calculation
```
baseFeeRate = baseFactor * binStep * 10                    // in 1e9 precision
variableFeeRate = variableFeeControl * (volAcc * binStep)² / 100 / 10000
totalFeeRate = baseFeeRate + variableFeeRate
feeAmount = amount * totalFeeRate / 1e9
```

### Swap mechanics
Within a bin: constant-sum at the bin's price. Fee deducted from input first.
- Selling X for Y: `amountOut = amountAfterFee * binPrice / PRECISION` (capped by bin.amountY)
- Selling Y for X: `amountOut = amountAfterFee * PRECISION / binPrice` (capped by bin.amountX)

When a bin's output liquidity is exhausted, move to the next bin:
- X→Y (selling X): move to lower bin IDs (price decreases)
- Y→X (selling Y): move to higher bin IDs (price increases)

## Geyser streaming (Yellowstone gRPC)

Yellowstone is a gRPC interface for real-time Solana account updates. Key behaviors:

- Subscribe by providing account pubkeys. Each `SubscribeRequest` replaces the entire previous subscription
- Updates arrive as `SubscribeUpdate` with `account` field containing pubkey, data, slot, lamports
- Commitment `PROCESSED` gives fastest updates but can be rolled back. `CONFIRMED` is safer but slower
- Stream can go stale — if no updates for 30s, reconnect
- On disconnect: exponential backoff, re-init all state from RPC before resubscribing
- gRPC stream is bidirectional — send new subscription request on same stream to update filters (for bin array resubscription)

Reconnection pattern:
1. Detect disconnect (stream error, end event, or stale timeout)
2. Cleanup old stream (removeAllListeners, cancel, destroy)
3. Wait with exponential backoff
4. Re-fetch all state from RPC (state may have changed while disconnected)
5. Open new stream, send fresh subscription

## RPC best practices

- `getMultipleAccountsInfo` for batch fetches (up to 100 accounts per call)
- Chunk large batches into groups of 100
- Always use `retry()` wrapper for RPC calls
- `getAccountInfo` returns null if account doesn't exist — handle this case
- Connection with `disableRetryOnRateLimit: false` for automatic 429 handling

## BigInt arithmetic

All token math in bigint. Common patterns:

- Fixed-point multiplication: `(a * b) / PRECISION`
- Fixed-point division: `(a * PRECISION) / b`
- Percentage: `amount * feeBps / 10000n`
- Square root: Newton's method (iterate `y = (x + n/x) / 2` until convergence)
- Comparison: standard operators work (`<`, `>`, `===`)
- Never mix bigint and number in arithmetic — explicit conversion required
