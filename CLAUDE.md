# pumpswap-meteora-arb

Single-chain Solana arbitrage bot. Detects and executes arbitrage between PumpSwap (constant product AMM) and Meteora (discrete liquidity bins) pools. Geyser streaming for real-time state, multi-relay TX sending, golden section amount optimization.

## Verification

After code changes, always run:
- Type check: `npx tsc --noEmit`
- Format specific changed files only: `npx prettier --write <file1> <file2> ...`
- Tests (if execution or math logic affected): `npm test`

## Scripts

```
npm test              — unit tests (swap math vs on-chain)
npm run test:arb      — simulate arb routes (no TX)
npm run test:arb:execute — execute arb on-chain (real TX, uses MIN_TRADE_LAMPORTS)
npm start             — build + run production bot
```

## Testing

- Test directory: `test/` (mirrors `src/` structure)
- Test files: `<module>.test.ts`
- Framework: Mocha + Chai (`describe`/`it`/`expect`)
- Swap math tests compare our estimation vs on-chain simulation for exact match
- Test amounts: `BUY_AMOUNTS` and `SELL_AMOUNTS` arrays with 3 values each
- Test execute uses `MIN_TRADE_LAMPORTS` (fixed, NOT golden search)
- Run: `npm test`

## Code Style

Write code the way an experienced Solana/DeFi engineer would — clean, purposeful, no filler.

- No boilerplate comments restating what the code already says
- No over-abstraction — if something is used once, inline it
- Variable names: domain-specific and precise (`reserveIn`, `binStep`, `amountAfterFee` — not `val`, `data`, `result`)
- Straightforward control flow over clever tricks
- Comments explain **why**, not **what** — save them for non-obvious decisions, math formulas, and protocol quirks
- Short focused functions — if one needs a paragraph of comments, split it
- No unnecessary wrappers, factories, or patterns-for-the-sake-of-patterns

## Design Principles

- **Pure Solana** — single chain, no EVM, no bridging
- **Event-driven hot path** — Geyser account update triggers arb check, no polling
- **Analytical math** — closed-form formulas, piecewise for multi-bin
- **Singleton services** — each service class instantiated once
- **Config-driven** — pool addresses in config, constants and enums in `config/`
- **Separation** — decoders, swap math, arb logic, state management, Geyser transport, sender are distinct layers
- **Scalable config** — adding a new token or pool pair = adding one entry in config, not touching core logic
- **Enums everywhere** — DEX types, pool types, token symbols, relay names — always enums, never raw strings

## Naming Conventions

- **PumpSwap** (not PumpFun, not AMM) — for all references to the PumpSwap DEX
- **Meteora** (not DLMM) — for all references to the Meteora DEX
- DexType enum: `PUMPSWAP`, `METEORA`
- Files: `pumpswap-*.ts`, `meteora-*.ts`
- Types: `PumpSwapPoolState`, `MeteoraPoolState`

## Pool Types

### PumpSwap (Constant Product AMM)
- Standard x*y=k automated market maker
- Fees deducted BEFORE swap (buy) or AFTER swap (sell)
- Fee rates come from on-chain FeeConfig (tiered by market cap, 25 tiers)
- Each fee component (LP, protocol, creator) ceil-rounded independently
- Pool account stores vault addresses; reserves live in vault token accounts
- Pool safety: -1 lamport on effective input (buy only)

### Meteora (Discrete Liquidity Bins)
- Liquidity organized in discrete price **bins**
- Each bin has a fixed price and acts as a constant-sum market (within the bin)
- Active bin: the bin where the current price sits; swaps consume liquidity bin-by-bin
- Base fee + variable fee (increases with volatility per bin crossed)
- Bin amounts stored as **u64** (NOT u128)
- Bin price: `price(binId) = (1 + binStep / 10000) ^ binId`
- Pool account stores: active bin ID, bin step, fee parameters
- Bin array accounts store per-bin liquidity (separate accounts, 70 bins each)

## Swap Math

### Constants
```typescript
PRECISION = 10n ** 18n                         // 1e18 for bigint fixed-point math
MAX_BIPS = 10_000n                             // 100% in basis points
FEE_PRECISION = 1_000_000_000n                 // 1e9 Meteora fee precision
BINS_PER_ARRAY = 70                            // bins per Meteora bin array account
MIN_TRADE_LAMPORTS = 100_000n                  // 0.0001 SOL — min trade
MAX_TRADE_LAMPORTS = 100_000_000n              // 0.1 SOL — max trade
DELTA_TRADE_LAMPORTS = 10_000n                 // golden search precision
```

### PumpSwap Buy — `pumpSwapGetBuyOutput(amountIn, reserveIn, reserveOut, feeBps)`
```
1. effectiveIn = floor(amountIn * 10000 / (10000 + totalFeeBps))
2. Adjust: if effectiveIn + sum(ceil(effectiveIn * bps / 10000)) > amountIn → effectiveIn -= 1
3. Pool safety: effectiveIn -= 1
4. output = effectiveIn * reserveOut / (reserveIn + effectiveIn)
```
Fee components [lpBps, protocolBps, creatorBps] each ceil-rounded independently. This differs from aggregate fee because sum(ceil) ≠ ceil(sum).

### PumpSwap Sell — `pumpSwapGetSellOutput(amountIn, reserveIn, reserveOut, feeBps)`
```
1. grossOut = floor(amountIn * reserveOut / (reserveIn + amountIn))
2. totalFee = sum(ceil(grossOut * bps / 10000)) for each fee component
3. output = grossOut - totalFee
```
No -1 safety margin on sell. Fees from output, not input.

### PumpSwap Fee Tiers
- Fees are dynamic, tiered by market cap (quoteReserve * 2)
- FeeConfig account (`5PHirr8j...`) stores 25 tiers
- Tier 0 (mcap < 420 SOL): LP=2, protocol=93, creator=30 = 125 bps total
- Tier 24 (mcap > 98K SOL): LP=20, protocol=5, creator=5 = 30 bps total
- Loaded at startup, updated via Geyser (throttled to 1 update/hour)
- Recalculated on every reserve commit in PumpSwapStateService

### Meteora Fee Calculation
```
baseFeeRate = baseFactor * binStep * 10                              // in FEE_PRECISION
variableFeeRate = ceil(variableFeeControl * (va * binStep)^2 / 1e11)
totalFeeRate = baseFeeRate + variableFeeRate
fee = ceil(amountIn * totalFeeRate / FEE_PRECISION)
```

### Meteora Per-Bin Volatility
```
va(k) = va0 + k * 10000
```
Where k = bins from start of swap. Fee increases with each bin crossed — protection against large swaps.

### Meteora Volatility Update (at swap start)
```
if elapsed >= decayPeriod: vRef = 0
if filterPeriod <= elapsed < decayPeriod: vRef = oldVa * reductionFactor / 10000
if elapsed < filterPeriod: vRef unchanged
indexReference = activeId (if elapsed >= filterPeriod)
va0 = vRef + |indexReference - activeId| * 10000
```

### Meteora Bin Price
```
binPrice(id) = (1 + binStep / 10_000) ^ id
```
Computed via binary exponentiation with PRECISION scaling. binId is signed i32, no offset.

### Meteora Swap (per bin)
```
fee = ceil(remaining * feeRate(k) / FEE_PRECISION)
afterFee = remaining - fee
X→Y: out = afterFee * price / PRECISION  (capped by bin.amountY)
Y→X: out = afterFee * PRECISION / price  (capped by bin.amountX)
```

## Arbitrage

### Amount Optimization
Golden section search finds optimal input between MIN_TRADE_LAMPORTS and MAX_TRADE_LAMPORTS.
Used in production (arb-detector). Tests use fixed MIN_TRADE_LAMPORTS.

### Two-Leg Simulation
```
tokens = buy(SOL → token, optimalAmount, buyDex)
solBack = sell(token → SOL, tokens, sellDex)
profit = solBack - optimalAmount
```

### Execution Flow
```
Geyser update → state commit → arb detector scan → findBestRoute → simulateArbitrage (golden search)
→ if profit >= MIN_PROFIT_LAMPORTS → executor.execute(opportunity, tip)
→ sender.send() to 6 relays in parallel → awaitConfirmation (poll all hashes)
→ refreshNonce → telegram notify
```

## State Management

### Geyser Streaming (Yellowstone gRPC)
Subscribe to: PumpSwap vault token accounts (2) + FeeConfig (1), Meteora LbPair (1) + bin arrays (2-3).
Also subscribes to blocksMeta for blockhash (used in TX confirmation).

### PumpSwap Two-Vault Sync
Both vaults change atomically per trade but Geyser delivers separately. Track which vaults updated — commit and trigger arb check when both have fresh data.

### Meteora Bin Array Resubscription
When activeId moves to a different bin array index, Geyser listener fetches new bin arrays via RPC and resends subscription with updated accounts.

### Block Data
Geyser streams blockMeta → stored in block-state module → executor uses for TX confirmation. Fallback to RPC getLatestBlockhash if not available.

## Transaction Sending

### Multi-Relay Architecture
6 relay services send the same TX in parallel, each with its own tip account:
- **Helius-Jito** — HTTP JSON-RPC
- **Block Razor** — gRPC binary (proto in `src/sender/relays/protos/`)
- **Astralane** — HTTP binary
- **Stellium** — HTTP JSON-RPC
- **Slot0** — HTTP binary
- **Corvus Falcon** — HTTP binary

Each relay builds a separate TX with tip transfer to its own random tip account.
Confirmation polls all candidate hashes via `getSignatureStatuses` — first confirmed wins.

### Tips
- `TIP_PERCENT` (10%) of profit sent as validator tip
- `MIN_TIP_LAMPORTS` (0.001 SOL) — minimum tip for relays to accept

### Durable Nonce
TX uses durable nonce (NonceAdvance as first instruction). After execution, nonce refreshed from on-chain.

## Notifications

Telegram bot sends notifications on arb execution (success/failure):
- Route, input, profit, tip, relay, solscan link
- Retry with exponential backoff via `retry()` utility
- Config: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` in `.env`

## Code Standards

### TypeScript
- strict mode, `const` by default, `let` only for mutation
- `interface` for object shapes, `type` for unions/intersections
- Explicit return types on exported functions
- No `any` — use `unknown` with type guards
- `readonly` for data that shouldn't mutate after init
- No unused imports or variables
- Target: ES2021, CommonJS

### Solana / Blockchain
- Token amounts as `bigint` — NEVER `Number()` or `parseFloat()` on amounts
- Validate data length before decoding accounts
- Handle RPC failures with retry + exponential backoff
- Commitment: `processed` for reads, `confirmed` for verification

### File Naming
- Modules: `kebab-case.ts` (e.g. `bigint-math.ts`)
- Services: `kebab-case.service.ts` (e.g. `pumpswap-state.service.ts`)
- Types: `kebab-case.types.ts` (e.g. `pumpswap.types.ts`)
- Config: `kebab-case.config.ts` (e.g. `pool.config.ts`)
- Decoders: `kebab-case.decoder.ts` (e.g. `pumpswap.decoder.ts`)

### Codebase Patterns
- Service classes with init() method
- Config files export typed constants
- Pool-specific logic via separate math modules
- State managers own their cache and expose getter/update methods
- Each directory has `index.ts` for re-exports

### Error Handling
- Geyser callback: catch → log → continue (never crash the stream)
- Executor: try/catch/finally ensures isPending always resets
- Telegram notify in catch: fire-and-forget (`.catch()`) to not block finally
- Handle all Promise rejections
- Geyser disconnect: reconnect with exponential backoff

### Quality
- No TODO/FIXME — fix now or create an issue
- No magic numbers — named constants
- No dead code, no unused imports
- Minimal diff — change only what the task requires

## Security

- No hardcoded secrets — environment variables only
- Validate all external data (check data length before decoding)
- Error messages must not leak keys or credentials

## Program IDs
```
PUMPSWAP_PROGRAM:    pSwapbiyqMh8U93RzGXzXCjJKHsXq5PsfKVR1AMTBEF
PUMP_FEE_PROGRAM:    pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ
METEORA_PROGRAM:     LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo
ARB_PROGRAM:         An3HM7PCKigYDszLj8iWYK7mWRnnnhECfM2tRZwsBFV9
SPL_TOKEN_PROGRAM:   TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
```

## Dependencies

- @solana/web3.js 1.95 — Connection, PublicKey, Transaction
- @solana/spl-token — ATA derivation, token accounts
- @triton-one/yellowstone-grpc — Geyser streaming client
- @grpc/grpc-js + @grpc/proto-loader — gRPC transport (Block Razor)
- bs58 — Base58 encoding/decoding
- dotenv — Environment variable loading
- chalk 4.x — Terminal coloring (CJS compatible)
- Mocha + Chai — Testing

## Tech Stack

- TypeScript 5.8, ES2021, CommonJS
- Prettier: tabs, 120 width, no trailing commas
