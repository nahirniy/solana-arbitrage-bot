---
name: solana-arb-dev
description: Senior TypeScript engineering standards for the Solana arbitrage bot. Activated on every code write, edit, and review in this repository.
---

# Senior TypeScript Engineering Standards

This is a test assignment. The code will be evaluated by experienced engineers. Every file, every function, every line must reflect the quality of a senior developer who has shipped production DeFi systems. No shortcuts, no AI-generated boilerplate, no "good enough".

## Feedback protocol

When the user rejects or comments on code — STOP everything. Read their message word by word. Fix that exact issue in that exact file. Show the fix. Only continue after confirmation. Never skip feedback, never batch it for later, never move to the next file while the current one has unresolved comments.

## Architecture mindset

Think before writing. Every architectural decision must answer three questions:
1. What happens when we add 10 more token pairs?
2. What happens when we add a third DEX protocol?
3. Can a new developer understand this module in under 2 minutes?

If any answer is "we'd need to refactor" — the design is wrong. Fix it now.

Core principles:
- Single responsibility — each module does one thing. A decoder decodes. A math module computes. A state manager caches. No god-objects.
- Open/closed — adding new behavior means adding new modules, not editing existing ones. A new DEX = new decoder + new math file. Zero changes to orchestration.
- Dependency inversion — high-level modules (arb detection, orchestration) depend on abstractions and interfaces, not on concrete PumpSwap or Meteora implementations.
- Explicit data flow — it must be obvious where data comes from and where it goes. No hidden globals, no ambient state, no side effects in pure functions.
- Layers never skip — transport (Geyser) → decoder → state → math → orchestration. Each layer only talks to its neighbors.
- No circular dependencies — if module A imports B, module B must never import A, directly or transitively.

## Extensibility patterns

The system must be designed so that growth is a config change, not a code change:

- Protocol-agnostic state management — state managers receive typed configs, they don't know if they're tracking PumpSwap or some future Raydium pool.
- Strategy pattern for swap math — each DEX type has its own math module that implements a common interface. The arb detector calls the interface, not the concrete implementation.
- Registry pattern for decoders — account routing maps pubkeys to handlers. Adding a new account type = registering a new handler. No switch/case chains that grow with every protocol.
- Config as typed code — pool definitions, token registries, DEX parameters live in typed config files (not env vars, not JSON blobs). Type system catches misconfigurations at compile time.
- Enum-driven categories — DEX types, token symbols, trade directions, account types. Always enums. Raw strings are invisible bugs waiting to happen.

## TypeScript craft

Write TypeScript that looks like it was written by someone who thinks in types:

- Strict mode, no `any`, no type assertions unless wrapping a known-safe external API
- `readonly` on every field that doesn't change after construction — this is documentation that compiles
- `const` by default, `let` only where mutation is genuinely needed
- Discriminated unions for state variants, enums for fixed categories
- Generics where they eliminate real duplication — never for show, never "just in case"
- Guard clauses first, happy path unindented — no deep nesting
- `interface` for object shapes, `type` for unions and mapped types
- Explicit return types on all exported functions — readers shouldn't guess
- Prefer `unknown` over `any` at API boundaries, narrow with type guards

## Code that doesn't look AI-generated

The number one tell of AI code is uniformity — every function has the same structure, same comment pattern, same level of abstraction. Real code written by a senior dev has personality:

- Some functions are 3 lines, some are 25. Length follows complexity, not a template
- Comments appear only where the code would be surprising without them. Most code has zero comments
- Variable names vary in length: `i` in a tight loop is fine, `volatilityAccumulator` for a domain concept is fine. Match the scope
- Error messages are specific and helpful: "LbPair buffer too short: expected >= 216 bytes, got 180" — not "invalid data"
- No "section divider" comments unless they genuinely help navigation in a long file
- No repeating the function name in a comment above it
- Utility functions are inlined if used once. Extracted only when truly shared
- Import order is natural — stdlib, external, internal — not obsessively sorted

## Error handling

- Fail fast with clear messages at system boundaries (config loading, env validation, account decoding)
- Never swallow errors silently — if catching, always log with context (what failed, what was the input, slot number if applicable)
- Event loop / stream callbacks: catch → log → continue. Crashing the Geyser stream over one bad account update is unacceptable
- RPC calls: retry with exponential backoff, configurable max retries, clear timeout
- Decoder functions return `null` on invalid data — they don't throw. The caller decides what to do

## Performance (hot path)

The arb detection path runs on every Geyser update. It must be fast:

- Zero RPC calls during price calculation — everything from pre-cached state
- Pre-compute what can be pre-computed at init (bin prices for known bins, fee rates when params don't change)
- Avoid object allocation in tight loops — reuse buffers, mutate in place where it matters
- BigInt arithmetic is the bottleneck — minimize unnecessary intermediate computations
- Profile before optimizing — don't sacrifice readability for unmeasured gains

## Blockchain / Solana specifics

- All token amounts as `bigint` — NEVER `Number()` or `parseFloat()` for calculations. JavaScript numbers lose precision above 2^53
- Validate account data buffer length before reading ANY field — on-chain data can be truncated, corrupted, or from a different program version
- Account decoding: check discriminator first, validate minimum length, return null on any mismatch
- Commitment levels: `processed` for speed (Geyser streaming), `confirmed` for anything that needs reliability
- PDA derivation: cache results — PDAs are deterministic, computing them repeatedly is waste
- Geyser subscription: Yellowstone replaces the entire subscription on each write — always send full filter set

## Testing

Unit tests are required for all math modules and decoders. Written after implementation.

- Math tests: known inputs → exact expected outputs. Include edge cases: zero amounts, max u64 values, amounts that cross bin boundaries, single bin vs multi-bin swaps
- Fee calculation tests: verify against known Meteora fee formula results
- Decoder tests: hand-crafted byte buffers with known field values → verify decoded struct. Truncated/malformed buffers → null return
- Price calculation tests: verify bin price computation for known binId/binStep combinations
- Arb math tests: mock pool states with known price discrepancy → verify direction detection and profit calculation
- Framework: Mocha + Chai with `describe`/`it`/`expect`

## File organization

- Modules: `kebab-case.ts`
- Services with singleton: `kebab-case.service.ts`
- Type definitions: `kebab-case.types.ts`
- Config files: `kebab-case.config.ts`
- Decoder modules: `kebab-case.decoder.ts`
- Each directory exports through `index.ts`
- No barrel files that re-export the entire world — only what neighboring modules need
