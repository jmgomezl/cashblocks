# CashBlocks

Visual drag-and-drop builder for Bitcoin Cash smart contracts.

**Live deployment:** https://cashblocks.dev (chipnet testnet)

CashBlocks converts a visual block graph — Trigger, Logic, Action, State — into valid [CashScript](https://cashscript.org) source code in real time. Contracts can be compiled and deployed to BCH chipnet directly from the browser. No CashScript experience is required.

Built for the **BCH Hackathon 2026**.

---

## Current Status

### Visual Block Builder
- Drag-and-drop Blockly canvas with four block categories: Triggers, Logic, Actions, State
- Real-time CashScript source preview that updates on every block change
- Inline compile error reporting
- Ten pre-built templates grouped into Standard and Classic Bitcoin categories

### Compiler Pipeline
- Pure TypeScript block-graph-to-CashScript transpiler (`BlockGraphCompiler.ts`)
- Supports time locks, multisig, hash locks, token covenants, on-chain NFT state, and conditional branching (IF/ELSE with AND/OR)
- Recipient fields accept both cashaddress format and raw 20-byte hex
- Handles inlined hex literals and constructor-arg patterns transparently

### Compile and Deploy
- Server-side `cashc@0.10.0` compilation via UUID-isolated temporary files
- Deploy to chipnet (default), testnet3, testnet4, or mainnet
- Deployment history persisted in `localStorage` per network
- Contract address and QR code shown on success

### Built-in Wallet
- Generate new secp256k1 keypairs
- Import wallets from WIF private key
- Real-time balance via chipnet ElectrumX, auto-refreshing every 10 seconds
- QR code for receiving funds
- Public key display for use as the `pk` argument during contract interaction
- Chipnet faucet link

### Contract Interaction Panel
- Lists all previously deployed contracts for the selected network
- "Fetch from chain" auto-fills UTXOs and routes outputs based on contract type:
  - SEND_BCH contracts: resolves recipient from constructor arg or inlined hex literal in source
  - SPLIT_PERCENT + SEND_BACK: populates two outputs with the correct ratio
  - SEND_BACK only: routes output back to the contract address
  - Unknown patterns: falls back to the connected wallet address
- `sig` arguments are automatically signed by the connected wallet
- `pubkey` arguments are automatically filled from the wallet's public key
- Custom fee field (default 1 000 satoshis)

### Verified On-Chain

The following interactions have been broadcast and confirmed on BCH chipnet:

| Contract Pattern | Transaction ID | Status |
|---|---|---|
| BCH_RECEIVED → SEND_BCH (Instant Send) | `761e0e0b5df0b5d5e2d141d743e629f67e08d6d18c9e8eb39e647abc482658dd` | Confirmed, 1 block |

---

## Quick Start

```bash
npm install
npm run dev
```

Vite serves the frontend on `http://localhost:5173` and proxies `/api/*` to the Express backend on `http://localhost:3001`.

### Production build

```bash
npm run build       # Output: dist/
npm run typecheck   # TypeScript strict-mode verification (zero errors required)
```

---

## Architecture

```
cashblocks/
├── src/
│   ├── compiler/
│   │   ├── BlockGraphCompiler.ts   # Pure TS: BlockGraph -> .cash source string
│   │   ├── templates.ts            # CashScript code snippets per block type
│   │   ├── parser.ts               # Blockly workspace -> BlockGraph IR
│   │   └── address.ts              # cashaddr <-> bytes20 normalizer
│   ├── blocks/
│   │   ├── definitions/            # Blockly JSON block definitions
│   │   ├── generators/             # Block -> BlockNode IR converters
│   │   └── toolbox.ts              # Toolbox category configuration
│   ├── components/
│   │   ├── BlockCanvas.tsx         # Blockly workspace component
│   │   ├── CodePreview.tsx         # Live CashScript display (read-only)
│   │   ├── DeployPanel.tsx         # Compile and deploy UI
│   │   ├── WalletPanel.tsx         # Wallet generation, import, and balance
│   │   └── InteractionsPanel.tsx   # Contract function call UI
│   └── services/
│       ├── wallet.ts               # /api/wallet/* API clients
│       ├── deployments.ts          # localStorage deployment history
│       └── interaction.ts          # /api/contract/interact client
├── server/
│   ├── index.ts                    # Express entry point and CORS
│   ├── compile.ts                  # cashc CLI wrapper
│   ├── deploy.ts                   # Contract instantiation and balance queries
│   ├── wallet.ts                   # Key generation and import
│   ├── interact.ts                 # Contract function call and broadcast
│   ├── fund.ts                     # P2PKH-to-contract funding transaction
│   └── network.ts                  # ElectrumNetworkProvider per network
└── contracts/examples/             # Pre-built workspace JSON templates
```

### Compiler Pipeline

```
Blockly workspace
      |
      v  parser.ts
  BlockGraph IR (nodes + edges)
      |
      v  BlockGraphCompiler.ts
  1. validateGraph()            — exactly one trigger, at least one action
  2. sortNodes()                — DFS topological ordering
  3. collectConstructorArgs()   — deduplicated constructor argument list
  4. needsSignature()           — determines function signature variant
  5. generateFunctionBody()     — maps each node to a CashScript snippet
      |
      v  templates.ts
  Assembled .cash source string
```

The compiler is entirely pure TypeScript: no network calls, no DOM access, no side effects. It can be tested in isolation without a running server.

### Block Reference

| Category | Available Blocks |
|---|---|
| Trigger | BCH Received, Token Received, Time Passed, Multisig Signed, Price Above, Hash Lock |
| Logic | IF/ELSE, AND, OR, Compare Value, Check Address |
| Action | Send BCH, Send Token, Split Percent, Time Lock Output, Send Back |
| State | Store in NFT, Read from NFT, Increment Counter |

---

## Templates

### Standard

| Template | Block Pattern |
|---|---|
| Vesting Contract | TIME_PASSED (90 d) -> SEND_BCH |
| Recurring Payment | TIME_PASSED (30 d) -> SPLIT_PERCENT 10% -> SEND_BCH + SEND_BACK |
| Token Split | TOKEN_RECEIVED -> SPLIT_PERCENT 70% -> SEND_TOKEN + SEND_TOKEN |
| Time-Locked Vault | TIME_PASSED (180 d) -> SEND_BCH |
| Escrow Between Two Parties | MULTISIG_SIGNED (2-of-2) -> SEND_BCH |
| Recurring Salary Payment | TIME_PASSED (30 d) -> SPLIT_PERCENT 90% -> SEND_BACK |

### Classic Bitcoin

These templates reproduce historical Bitcoin scripting patterns using CashBlocks blocks.

| Template | Historical Origin |
|---|---|
| Colored Coins Vault | Colored Coins protocol (2012) — native CashTokens equivalent |
| Namecoin Name Registry | Namecoin (2011) — on-chain name-to-value storage via NFT commitment |
| HTLC / Atomic Swap | Hash Time-Lock Contract — the primitive behind Lightning Network |
| On-chain Counter | NFT commitment as mutable state machine |

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/compile` | POST | Compiles CashScript source to artifact JSON via `cashc` |
| `/api/deploy` | POST | Instantiates the contract and returns the P2SH32 address |
| `/api/balance` | GET | Fetches address balance via ElectrumX |
| `/api/utxos` | GET | Fetches UTXO list for an address |
| `/api/fund` | POST | Broadcasts a funding transaction from wallet to contract |
| `/api/contract/interact` | POST | Signs and broadcasts a contract function call |
| `/api/wallet/generate` | POST | Creates a new keypair and returns WIF |
| `/api/wallet/import` | POST | Derives address and public key from a WIF private key |
| `/api/wallet/balance` | GET | Returns confirmed balance and UTXO count for an address |

---

## Roadmap

### v0.2 — Interaction Completeness
- Fee auto-calculation: derive the actual transaction size before broadcasting and set the fee accordingly, removing the need for the hardcoded field
- Token interaction: UTXO and output routing support for SEND_TOKEN contracts in the Interact panel
- Transaction history: per-contract activity log with links to the chipnet block explorer
- Shareable contract links: encode the block graph and deployed address into a URL

### v0.3 — Network and Signature Expansion
- Mainnet mode: opt-in toggle with explicit warnings and a confirmation gate
- Multi-signature interaction: collect and combine partial signatures across separate sessions before broadcasting
- Oracle integration: connect the PRICE_ABOVE block to a live BCH/USD price oracle data signature
- Export to `.cash` file: download the generated source directly from the UI
- Import CashScript: best-effort reverse compilation from a `.cash` file back into blocks

### v1.0 — Platform
- NFT minting block: issue fungible tokens and NFTs from within a CashBlocks contract
- Covenant composer: chain multiple contracts so the output of one becomes the input of the next
- Mobile layout: touch-friendly canvas for phone and tablet use
- Full integration test suite: automated tests for every block type against chipnet
- Plugin API: third-party block definitions and template packs
- No-code deployment wizard: guided step-by-step flow with plain-English descriptions for non-technical users

---

## Known Limitations

**Fee tolerance is baked into the contract.** The `require(tx.outputs[0].value >= tx.inputs[0].value - N)` covenant sets the maximum fee at deploy time. Contracts deployed before v0.2 have a 1 000-sat ceiling; new deployments use 2 000 sat. If a transaction is rejected for "min relay fee not met", reduce the number of UTXOs being spent or redeploy with the latest template.

**Single-input value reference.** The generated value covenant references `tx.inputs[0].value` rather than the value of the currently-executing input (`tx.inputs[this.activeInputIndex].value`). Multi-UTXO interactions pass in practice but the template will be corrected in v0.2.

**Oracle block is a placeholder.** The PRICE_ABOVE block generates valid CashScript but requires a real oracle data signature at spend time. No oracle provider is integrated.

**Wallets are single-keypair.** Generated wallets are bare secp256k1 keypairs with no BIP-39 mnemonic or BIP-44 derivation.

**Deployment history is local.** Records are stored in `localStorage`. Clearing browser storage removes all deployment history.

---

## Contributing

See [AGENTS.md](AGENTS.md) for coding conventions, commit style, and how to run the test suite.
See [WIKI.md](WIKI.md) for the full user guide, block reference, and troubleshooting.

Stack: React 18, TypeScript (strict), Blockly.js, CashScript SDK, Express, Vite.

---

## License

MIT
