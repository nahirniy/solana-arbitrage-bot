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

**CRITICAL:** Always verify the actual on-chain type before decoding. Meteora bin amounts are u64, NOT u128 — reading as u128 merges two u64 fields into garbage.

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

### Buy (SOL → Token)
Fees deducted from INPUT before swap. Each fee component (LP, protocol, creator) ceil-rounded independently. Pool applies -1 lamport safety margin.

```
effectiveIn = floor(input * 10000 / (10000 + totalBps))
if effectiveIn + sum(ceil(effectiveIn * bps / 10000)) > input → effectiveIn -= 1
effectiveIn -= 1  (pool safety)
output = effectiveIn * reserveOut / (reserveIn + effectiveIn)
```

### Sell (Token → SOL)
Swap first (pure x*y=k), then fees from OUTPUT. Each fee ceil-rounded from grossOut. No -1 safety.

```
grossOut = floor(amountIn * reserveOut / (reserveIn + amountIn))
totalFee = sum(ceil(grossOut * bps / 10000)) for each component
output = grossOut - totalFee
```

### Fee tiers
Dynamic, tiered by market cap (quoteReserve * 2). 25 tiers stored in FeeConfig account (`pfeeUxB6...`).
- Tier 0 (mcap < 420 SOL): LP=2, protocol=93, creator=30 = 125 bps
- Tier 24 (mcap > 98K SOL): LP=20, protocol=5, creator=5 = 30 bps

**Key insight:** sum of 3 individual ceil fees ≠ ceil of total. Must compute each separately.

### Why buy and sell have different formulas
PumpSwap charges fees always in SOL:
- Buy: SOL comes in → fee from SOL before swap → inverse formula
- Sell: Token comes in → swap → SOL comes out → fee from SOL after swap

## Meteora protocol

Program ID: `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`

Discrete liquidity bins — each bin is a constant-sum market at a fixed price.

### LbPair account (main pool)
Contains: activeId (i32), binStep (u16), fee parameters, token mints, vault pubkeys.

Layout (~900+ bytes) with nested structs:
- StaticParameters (32 bytes): baseFactor, filterPeriod, decayPeriod, reductionFactor, variableFeeControl, maxVolatilityAccumulator
- VariableParameters (32 bytes): volatilityAccumulator, volatilityReference, indexReference, lastUpdateTimestamp
- Then: activeId (i32 @ 76), binStep (u16 @ 80), mints, vaults, etc.

### BinArray accounts
Each holds 70 bins. Each bin is 144 bytes:
- amountX (**u64**, 8 bytes @ +0) — token X liquidity
- amountY (**u64**, 8 bytes @ +8) — token Y liquidity
- Remaining: liquiditySupply, rewards, fee tracking

**CRITICAL:** amountX and amountY are u64, NOT u128. Reading as u128 merges two u64 fields into one garbage number.

Bin array PDA: `findProgramAddressSync(["bin_array", lbPairPubkey, i64LE(binArrayIndex)], METEORA_PROGRAM)`

### Bin price
```
price(binId) = (1 + binStep / 10000) ^ binId
```
binId is signed i32 (can be negative). No offset needed. Computed via binary exponentiation with PRECISION (1e18) scaling.

### Fee calculation
```
baseFeeRate = baseFactor * binStep * 10                              // in FEE_PRECISION (1e9)
variableFeeRate = ceil(variableFeeControl * (va * binStep)^2 / 1e11)
totalFeeRate = baseFeeRate + variableFeeRate
fee = ceil(amount * totalFeeRate / FEE_PRECISION)
```

### Per-bin volatility during swap
Fee is NOT constant across bins. When swap crosses bins, volatility increases:
```
va(k) = va0 + k * 10000
```
Where k = number of bins from swap start. Each crossed bin increases fee.

### Volatility update at swap start
```
if elapsed >= decayPeriod (1200s): vRef = 0
if filterPeriod (300s) <= elapsed < decayPeriod: vRef = oldVa * reductionFactor / 10000
if elapsed < filterPeriod: vRef unchanged
indexReference = activeId (if elapsed >= filterPeriod)
va0 = vRef + |indexReference - activeId| * 10000
```

### Swap mechanics
Within a bin: constant-sum at the bin's price. Fee deducted from input first.
- X→Y: `out = afterFee * price / PRECISION` (capped by bin.amountY)
- Y→X: `out = afterFee * PRECISION / price` (capped by bin.amountX)

When exhausted, move to next bin (lower IDs for X→Y, higher for Y→X).

## Geyser streaming (Yellowstone gRPC)

Yellowstone is a gRPC interface for real-time Solana account updates. Key behaviors:

- Subscribe by providing account pubkeys. Each `SubscribeRequest` replaces the entire previous subscription
- Updates arrive as `SubscribeUpdate` with `account` field containing pubkey, data, slot, lamports
- `blockMeta` updates provide blockhash + blockHeight for TX confirmation
- Commitment `PROCESSED` gives fastest updates but can be rolled back. `CONFIRMED` is safer but slower
- Stream can go stale — if no updates for 30s, reconnect
- On disconnect: exponential backoff, re-init all state from RPC before resubscribing
- gRPC stream is bidirectional — send new subscription request on same stream to update filters

### Subscribed accounts in this bot
- PumpSwap: 2 vault token accounts + FeeConfig account
- Meteora: LbPair account + 2-3 bin array accounts
- blocksMeta for blockhash/blockHeight

### Bin array resubscription
When Meteora activeId moves to a different bin array index, fetch new arrays via RPC and resend subscription.

## Durable nonce transactions

Durable nonce replaces blockhash — TX stays valid until nonce is advanced.
- `SystemProgram.nonceAdvance()` must be FIRST instruction
- Nonce value used as `recentBlockhash` in transaction message
- After TX confirms (success or fail), nonce is advanced on-chain
- After TX dropped (never in block), nonce stays same — safe to reuse
- `refreshNonce()` reads current value from on-chain account

## Multi-relay TX sending

6 relays send the same arb TX in parallel, each with its own tip account:
- Helius-Jito (HTTP JSON-RPC), Block Razor (gRPC), Astralane (HTTP binary), Stellium (HTTP JSON-RPC), Slot0 (HTTP binary), Corvus Falcon (HTTP binary)
- Each builds separate TX with tip transfer to relay's random tip account
- Confirmation polls all candidate hashes via `getSignatureStatuses`
- First confirmed hash wins

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
- Ceil division: `(a + b - 1n) / b`
- Percentage: `amount * feeBps / 10000n`
- Comparison: standard operators work (`<`, `>`, `===`)
- Never mix bigint and number in arithmetic — explicit conversion required
