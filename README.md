# PumpSwap-Meteora Arbitrage Bot

Single-chain Solana arbitrage bot that detects and executes arbitrage opportunities between **PumpSwap** (constant product AMM) and **Meteora** (discrete liquidity bins) pools for the same token pair.

## Architecture

```
  PumpSwap Pool              Meteora Pool
   (x * y = k)               (discrete bins)
    LIA / WSOL                 LIA / WSOL
        |                          |
        |__________________________|
                    |
             Geyser Stream
          (real-time updates)
                    |
                    v

  State        Arb          Amount
  Manager --> Detector --> Optimizer
    |                         |
  Geyser                      v
  updates                Executor
  + blockMeta                 |
                              v
                    6 Relays in parallel

                    Helius-Jito    Astralane
                    Stellium       Slot0
                    Falcon         BlockRazor
                              |
                              v
                 Confirm TX --> Telegram Notify
```

## Arbitrage Flow

```
 1. Geyser streams account update
    (vault balance, bin array, pool state)
                    |
                    v
 2. State manager decodes + commits
                    |
                    v
 3. Arb detector compares prices
                    |
                    v
 4. Price discrepancy? --NO--> wait
        |
       YES
        |
        v
 5. Golden section search (0.0001 - 0.1 SOL)
        |
        v
 6. Buy cheap DEX --> Sell expensive DEX
        |
        v
 7. Profit >= threshold? --NO--> wait
        |
       YES
        |
        v
 8. Build TX: durable nonce + validator tip
        |
        v
 9. Send via 6 relays in parallel
        |
        v
10. Poll candidate hashes for confirmation
        |
        v
11. Confirmed --> refresh nonce --> Telegram
```

## On-Chain Arb Program

The bot executes arbitrage through a custom Anchor program deployed on Solana.

**Program ID:** `An3HM7PCKigYDszLj8iWYK7mWRnnnhECfM2tRZwsBFV9`

The program exposes a single instruction `execute_arb` that performs both legs of the arbitrage atomically in one transaction via CPI:

1. **Buy leg** — CPI to PumpSwap `buy_exact_quote_in` or Meteora `swap2`
2. **Sell leg** — CPI to the other DEX in the opposite direction

If either leg fails or the final output is less than `min_base_amount_out`, the entire transaction reverts. This guarantees atomic execution — no partial fills.

**Transaction structure:**
```
Instruction 0: NonceAdvance (durable nonce)
Instruction 1: execute_arb
  - routes: [{dex, token_in, token_out}, {dex, token_in, token_out}]
  - amount_in: optimal SOL amount
  - accounts: shared (11) + PumpSwap (17+) + Meteora (9+)
Instruction 2: SystemProgram.transfer (validator tip)
```

Transactions use an Address Lookup Table (LUT) to compress ~38 accounts into a single versioned transaction under the 1232-byte limit.

## Swap Math

### PumpSwap (Buy)

Fees deducted from input. Each component ceil-rounded independently:

```
effectiveIn = floor(input × 10000 / (10000 + totalFeeBps))
adjust if ceil fees overflow
effectiveIn -= 1  (pool safety)
output = effectiveIn × reserveOut / (reserveIn + effectiveIn)
```

### PumpSwap (Sell)

Swap first, fees from output:

```
grossOut = floor(tokenIn × reserveOut / (reserveIn + tokenIn))
fee = ceil(grossOut × lpBps/10000) + ceil(grossOut × protBps/10000) + ceil(grossOut × crBps/10000)
output = grossOut - fee
```

### Meteora

Per-bin constant-sum with dynamic fee that increases per bin crossed:

```
for each bin along swap path:
  va(k) = va0 + k × 10000          // volatility grows per bin
  feeRate = baseFee + varFee(va(k))
  fee = ceil(remaining × feeRate / 1e9)
  output += swap at bin price
```

## Project Structure

```
src/
├── index.ts                    Entry point
├── config/                     Constants, env, pool config, account providers
│   └── accounts/               Per-DEX account builders for arb program
├── types/                      All TypeScript interfaces and enums
├── decoders/                   On-chain account data decoders
│   ├── pumpswap.decoder.ts     PumpSwap pool + FeeConfig decoder
│   ├── meteora.decoder.ts      Meteora LbPair + BinArray decoder
│   └── token-account.decoder.ts
├── math/                       Pure swap math (no RPC, no state)
│   ├── pumpswap-math.ts        Buy/sell with individual ceil fees
│   ├── meteora-math.ts         Multi-bin swap with per-bin volatility
│   ├── arbitrage-math.ts       Route finding + golden section optimizer
│   └── bigint-math.ts          BigInt utilities
├── state/                      Cached pool state from Geyser
│   ├── pumpswap-state.service.ts  Two-vault sync + fee tier updates
│   ├── meteora-state.service.ts   Pool + bin array + resubscription
│   ├── pool-state.service.ts      Router: pubkey → handler
│   ├── block-state.ts             Blockhash from Geyser blockMeta
│   └── state-init.ts              RPC bootstrap at startup
├── geyser/                     Yellowstone gRPC streaming
│   └── geyser-listener.service.ts
├── arb/                        Arbitrage detection
│   └── arb-detector.service.ts
├── execution/                  TX building and execution
│   ├── arb-executor.service.ts
│   ├── account-builder.ts
│   ├── transaction-builder.ts
│   └── startup-setup.ts        ATA, LUT, nonce initialization
├── sender/                     Multi-relay TX sending
│   ├── sender.service.ts       Parallel send + confirmation polling
│   ├── tip-accounts.ts         Per-relay tip account registry
│   └── relays/                 6 relay implementations
│       ├── helius-jito.ts
│       ├── astralane.ts
│       ├── stellium.ts
│       ├── slot0.ts
│       ├── corvus-falcon.ts
│       ├── block-razor.ts
│       └── protos/             gRPC proto definitions
└── utils/                      Logger, retry, PDA, telegram
test/
├── swap-math.test.ts           Exact match: our math vs on-chain simulation
├── execute-arb.ts              Test arb execution (simulate + on-chain)
└── utils/                      Test swap builders
```

## Setup

### Prerequisites

- Node.js 20+
- Solana wallet with SOL
- Geyser endpoint (Yellowstone gRPC)
- On-chain arb program deployed

### Environment Variables

```bash
cp .env.example .env
```

Required:
```
RPC_URL=                    # Solana RPC endpoint
GEYSER_URL=                 # Yellowstone gRPC endpoint
PRIVATE_KEY=                # Wallet private key (base58)
```

Optional (created automatically if missing):
```
NONCE_ADDRESS=              # Durable nonce account
LUT_ADDRESS=                # Address Lookup Table
```

Relay API keys (optional, enables multi-relay sending):
```
HELIUS_RPC_URL=
BLOCKRAZOR_SOLANA_GRPC=
BLOCKRAZOR_SOLANA_GRPC_FEE=
BLOCKRAZOR_SOLANA_TOKEN=
ASTRALANE_API_KEY=
STELLIUM_API_KEY=
SLOT0_API_KEY=
CORVUS_FALCON_API_KEY=
```

Telegram notifications (optional) — [@arbitrage_solana_test_bot](https://t.me/arbitrage_solana_test_bot):
```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

### Install & Run

```bash
npm install
npm run build
npm start
```

### Testing

```bash
# Unit tests — swap math exact match vs on-chain
npm test

# Simulate arb routes (no real TX)
npm run test:arb

# Execute arb on-chain (real TX with MIN_TRADE amount)
npm run test:arb:execute
```

## Configuration

Key constants in `src/config/constants.ts`:

| Constant | Default | Description |
|----------|---------|-------------|
| `MIN_TRADE_LAMPORTS` | 100,000 (0.0001 SOL) | Minimum trade size |
| `MAX_TRADE_LAMPORTS` | 100,000,000 (0.1 SOL) | Maximum trade size |
| `DELTA_TRADE_LAMPORTS` | 10,000 | Golden search precision |
| `TIP_PERCENT` | 10 | % of profit as validator tip |
| `MIN_TIP_LAMPORTS` | 1,000,000 (0.001 SOL) | Minimum relay tip |
| `MIN_PROFIT_LAMPORTS` | 0 | Minimum profit to execute |
| `FEE_CONFIG_UPDATE_INTERVAL_MS` | 3,600,000 (1h) | Fee tier refresh throttle |

## Tech Stack

- **TypeScript 5.8** — ES2021, CommonJS
- **@solana/web3.js** — RPC, transactions, keypairs
- **@solana/spl-token** — ATA derivation
- **@triton-one/yellowstone-grpc** — Geyser streaming
- **@grpc/grpc-js** — gRPC transport (Block Razor relay)
- **Mocha + Chai** — Testing
