# CashBlocks Wiki

Welcome to the CashBlocks wiki. This guide walks you through running the app, composing contracts with the visual builder, and understanding the technical principles that power the platform.

## Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Working in the UI](#working-in-the-ui)
   - [Wallet Panel](#wallet-panel)
   - [Canvas & Blocks](#canvas--blocks)
   - [CashScript Preview](#cashscript-preview)
   - [Deployment Panel](#deployment-panel)
   - [Interact Panel](#interact-panel)
4. [Block Reference](#block-reference)
   - [Trigger Blocks](#trigger-blocks)
   - [Logic Blocks](#logic-blocks)
   - [Action Blocks](#action-blocks)
   - [State Blocks](#state-blocks)
5. [Templates & Examples](#templates--examples)
6. [Live Chipnet Deployment Example](#live-chipnet-deployment-example)
7. [Constructor Arguments](#constructor-arguments)
7. [Technical Foundations](#technical-foundations)
   - [Project Layout](#project-layout)
   - [Compiler Pipeline](#compiler-pipeline)
   - [Backend Services](#backend-services)
8. [Advanced Usage & Tips](#advanced-usage--tips)
9. [Troubleshooting](#troubleshooting)

---

## Overview

CashBlocks is a drag-and-drop builder for Bitcoin Cash smart contracts. Users assemble **Trigger → Logic → Action → State** blocks on a visual canvas, and the app converts the resulting graph into valid CashScript source code in real time. From there, the contract can be compiled and deployed to BCH **chipnet** (testnet) with one click. No CashScript experience is required — all code is generated automatically and previewed live.

Key features:
- Visual blocks for common covenant patterns: time locks, splits, multisig, token handling, on-chain state.
- Live CashScript preview with inline error reporting.
- Built-in wallet tools: generate/import, faucet links, auto balance refresh every 10 s.
- One-click compilation (`cashc`) and deployment via an Express backend.
- Ten pre-built templates loadable from the header dropdown, grouped into Standard and Classic Bitcoin categories.
- Contract interaction panel for calling deployed contract functions.

---

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run the dev servers** (Vite front end + Express back end)
   ```bash
   npm run dev
   ```
   Vite serves the front end on `http://localhost:5173` and proxies `/api/*` to the Express server on `http://localhost:3001`.

3. **Open the app**
   Navigate to `http://localhost:5173`. Load a template from the **Templates** dropdown or start with an empty canvas.

4. **Create a wallet**
   Click **Generate Wallet** in the left sidebar. Copy the chipnet address and request testnet coins from the faucet link shown.

5. **Build & deploy**
   Drag blocks onto the canvas, fill any constructor args in the Deploy panel, and click **Deploy Contract**. The contract address and QR code appear on success.

---

## Working in the UI

The screen is divided into three columns:

| Column | Width | Contents |
|---|---|---|
| Left sidebar | 280 px | Wallet Panel + contract status |
| Center | flex 1 | Blockly canvas |
| Right panel | 380 px | CashScript Preview (top 55 %) + Deploy / Interact (bottom 45 %) |

### Wallet Panel

- **Generate / Import**: Create a chipnet wallet or import an existing WIF private key. Keys are stored client-side in `localStorage` — do not use for mainnet funds.
- **Balance**: Refreshes every 10 seconds via a live Electrum query to chipnet.
- **Faucet**: Click the faucet link to open `tbch.googol.cash` and request testnet BCH.
- **Address & Keys**: Copy the cashaddr with one click. Private keys stay hidden until you click **Show**.
- **QR Code**: Displayed for easy funding from a mobile wallet.

> **Contract Status** — below the wallet, a small card shows whether the current block graph is valid, how many constructor args it needs, and any compile error summary.

### Canvas & Blocks

- **Toolbox** (left rail of the canvas): Four categories — Triggers (green), Logic (blue), Actions (orange), State (purple). Drag any block onto the canvas to begin.
- **Chaining**: Connect blocks vertically. Most blocks have a top notch (previous statement) and a bottom tab (next statement). Logic value blocks (AND, OR, COMPARE_VALUE) plug into the **CONDITION** socket of an IF_ELSE block instead of the main chain.
- **Fields**: Click directly on a block to edit its numeric or text fields (e.g., number of days, percentage, category hex).
- **Zoom / Pan**: Use the Blockly toolbar or scroll wheel. Drag the canvas background to pan.
- **Delete**: Drag blocks to the trash icon, or press **Delete** / **Backspace** with a block selected.

Every change triggers an immediate recompile — the CashScript preview updates in under a millisecond.

### CashScript Preview

- Displays the generated `.cash` source. The output is read-only; all edits happen via blocks.
- Compile errors appear in red at the top of the panel.
- The source follows the CashScript `^0.10.0` pragma and is ready to feed directly into `cashc`.

### Deployment Panel

1. **Constructor Args** — Input fields appear for every argument the contract requires (e.g., `recipientHash`, `unlockTime`). Defaults are auto-filled where possible:
   - `recipientHash` → pre-filled from the connected wallet address.
   - `unlockTime` → pre-filled with **now + 90 days** (absolute Unix timestamp). Adjust to taste.
2. **Deploy Contract** — Disabled until both conditions are met:
   - The block graph compiles without errors.
   - A wallet is loaded in the sidebar.
3. **Result** — Shows the chipnet contract address and a QR code. Click **Copy Address** to copy to clipboard.
4. **New Deploy** — Resets the panel so you can deploy a different configuration.

### Interact Panel

Switch to the **Interact** tab (next to Deploy) to call functions on previously deployed contracts. Select a contract from the list, provide function arguments, and submit. The backend signs and broadcasts the transaction using the loaded wallet.

---

## Block Reference

### Trigger Blocks

Every contract must start with exactly one Trigger block at the top of the chain.

| Block | Fields | What it enforces | Generated CashScript |
|---|---|---|---|
| **BCH Received** | `minAmount` (satoshis) | Input value ≥ minimum | `require(tx.inputs[0].value >= minAmount)` |
| **Token Received** | `categoryHex` (32-byte hex) | Input token category matches | `require(tx.inputs[0].tokenCategory == 0x...)` |
| **Time Passed** | `days` | Current MTP ≥ `unlockTime` constructor arg | `require(tx.time >= unlockTime)` |
| **Multisig Signed** | `required`, `total` | M-of-N signature check | `require(checkMultiSig([s0,s1,...], [pk0,pk1,...]))` |
| **Price Above** | `usdThreshold` | Requires oracle data signature (constructor arg) | `require(oraclePrice >= threshold)` |
| **Hash Lock** | `expectedHash` (64-char hex) | Caller must reveal a secret whose `hash256` matches | `require(hash256(preimage) == expectedHash)` |

> **Hash Lock note**: When this block is present the compiler automatically prepends `bytes preimage` to the function signature. The caller must supply the preimage when spending the contract. Use `hash256(secret)` (in any BCH tool) to pre-compute the `expectedHash` value at deploy time. This is the foundational pattern behind HTLCs, Lightning channels, and atomic swaps.

> **Time Passed note**: The `unlockTime` constructor arg must be an **absolute Unix timestamp** (seconds since epoch), not a duration. Example: `Math.floor(Date.now() / 1000) + 90 * 86400` for 90 days from now. The deploy panel pre-fills a sensible default and the generated code includes a comment with the formula.

> **Token Received note**: If you leave `categoryHex` blank, it becomes a `tokenCategory` constructor arg that you fill in at deploy time. This is useful for deploying a generic token-handling template.

---

### Logic Blocks

Logic blocks come in two flavours:

**Statement blocks** — placed directly in the block chain:

| Block | Fields | What it does |
|---|---|---|
| **Check Address** | — | Verifies the spending signature comes from the expected address (`require(hash160(pk) == recipientHash)` + `require(checkSig(s, pk))`) |
| **IF / ELSE** | CONDITION socket | Branches execution. Connect an AND, OR, or COMPARE_VALUE block to its CONDITION socket, and place action blocks in its THEN and ELSE input slots. |

**Value blocks** — plug into IF_ELSE's CONDITION socket (cannot be placed in the main chain alone):

| Block | Fields | Expression generated |
|---|---|---|
| **COMPARE_VALUE** | `operator`, `threshold` | `tx.inputs[0].value > threshold` |
| **AND** | A socket, B socket | `(conditionA && conditionB)` |
| **OR** | A socket, B socket | `(conditionA \|\| conditionB)` |

**Example — using IF_ELSE with AND:**

1. Drag an **IF_ELSE** block below your Trigger.
2. Drag a **COMPARE_VALUE** block into its CONDITION socket (e.g., amount > 50000).
3. Place a **SEND_BCH** block inside the THEN slot.
4. Place a **SEND_BACK** block inside the ELSE slot.

This produces:
```cashscript
if (tx.inputs[0].value > 50000) {
    require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(recipientHash));
    require(tx.outputs[0].value >= tx.inputs[0].value - 1000);
} else {
    require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2SH32(this.activeBytecode));
}
```

---

### Action Blocks

Action blocks enforce specific spending outputs. Each action block corresponds to one transaction output. When you use **SPLIT_PERCENT**, the two **SEND_\*** blocks that follow it constrain outputs 0 and 1 respectively — SPLIT_PERCENT itself only enforces the value ratio.

| Block | Fields | What it enforces |
|---|---|---|
| **Send BCH** | `recipientHash` (optional) | Output locking bytecode = P2PKH to recipient; value ≥ input − 1000 sat fee |
| **Send Token** | `recipientHash`, `categoryHex` (both optional) | Output locking bytecode + token category match |
| **Split Percent** | `percent` (1–99) | Two outputs with values at `percent`% and `(100 − percent)`% of the input minus fee |
| **Time Lock Output** | `days` | Output value ≥ input − fee (sequence-number relative timelock placeholder) |
| **Send Back** | — | Output locking bytecode = P2SH32 of `this.activeBytecode` (contract sends to itself) |

> **SPLIT_PERCENT wiring**: Place SPLIT_PERCENT first, then chain two SEND_\* blocks immediately after. The first SEND_\* constrains output 0 (the larger share) and the second constrains output 1 (the smaller share). Omitting the SEND_\* blocks after SPLIT_PERCENT will produce incomplete CashScript that `cashc` will reject.

---

### State Blocks

State blocks read from and write to the NFT commitment field on inputs/outputs. This enables simple on-chain storage patterns using CashTokens.

| Block | Fields | What it does |
|---|---|---|
| **Store in NFT** | `key` | Preserves NFT commitment: `require(tx.outputs[0].nftCommitment == tx.inputs[0].nftCommitment)` |
| **Read from NFT** | `key` | Reads commitment: `bytes storedData = tx.inputs[0].nftCommitment` |
| **Increment Counter** | — | Deserializes counter, increments, and re-serializes into the output commitment |

> State blocks require the spending UTXO to carry an NFT (mutable or minting capability). Fund the contract with a token UTXO that has an NFT commitment before attempting to use these contracts.

---

## Templates & Examples

Load any template from the **Templates** dropdown in the header. Each loads a complete block graph and pre-fills constructor arg defaults. Templates are grouped into two categories.

#### Standard

| Template | Blocks | Description |
|---|---|---|
| **Vesting Contract** | TIME_PASSED (90 d) → SEND_BCH | Funds locked for 90 days, then released to recipient. Hero demo. |
| **Recurring Payment** | TIME_PASSED (30 d) → SPLIT_PERCENT 10% → SEND_BCH → SEND_BACK | Sends 10 % to recipient monthly and re-locks 90 % back to the contract, resetting the timer. |
| **Token Split** | TOKEN_RECEIVED → SPLIT_PERCENT 70% → SEND_TOKEN → SEND_TOKEN | Splits incoming tokens 70/30 between two outputs of the same category. |
| **Time-Locked Vault** | TIME_PASSED (180 d) → SEND_BCH | 6-month savings vault; same pattern as Vesting but longer duration. |
| **Escrow Between Two Parties** | MULTISIG_SIGNED (2-of-2) → SEND_BCH | Funds release only when both parties sign. |
| **Recurring Salary Payment** | TIME_PASSED (30 d) → SPLIT_PERCENT 90% → SEND_BACK | Keeps 90 % of funds in contract each month (releasing 10 % to owner) with automatic re-lock. |

#### Classic Bitcoin

These templates recreate the original Bitcoin scripting patterns that defined programmable money — now expressible on BCH in two to three blocks.

| Template | Blocks | Historical origin |
|---|---|---|
| **Colored Coins Vault** | TOKEN_RECEIVED → CHECK_ADDRESS → SEND_TOKEN | Colored Coins protocol (2012) — tokens representing real-world assets on a UTXO chain. On BCH these are native CashTokens. |
| **Namecoin Name Registry** | BCH_RECEIVED → STORE_IN_NFT → SEND_BACK | Namecoin (2011) — the first Bitcoin sidechain, introducing on-chain name→value storage. Here the NFT commitment acts as the persistent record; SEND_BACK keeps the contract alive indefinitely. |
| **HTLC / Atomic Swap** | HASH_LOCK → SEND_BCH | Hash Time-Lock Contract — the primitive behind Lightning Network, cross-chain atomic swaps, and payment channels. The spender proves knowledge of a secret by revealing its preimage. |
| **On-chain Counter** | BCH_RECEIVED → INCREMENT_COUNTER → SEND_BACK | Demonstrates NFT commitment as mutable on-chain storage: each spend increments the counter and re-locks the contract, creating a simple state machine. |

All templates produce valid CashScript that compiles and deploys to chipnet without modification. Fill in the constructor args in the Deploy panel before clicking Deploy.

---

## Live Chipnet Deployment Example

The following is a **real end-to-end run** of the Vesting template against BCH chipnet, executed on 2026-02-24. Every hash, address, and transaction ID shown here is verifiable on-chain.

### What happened

1. The block graph `TIME_PASSED (90 d) → SEND_BCH` was fed into `BlockGraphCompiler.ts`, producing this CashScript source:

```cashscript
pragma cashscript ^0.10.0;

contract GeneratedContract(
    int unlockTime,
    bytes20 recipientHash
) {
    function execute(sig s, pubkey pk) {
        // Verify signature
        require(checkSig(s, pk));

        // TRIGGER: Time passed (90 days)
        // unlockTime must be an absolute Unix timestamp (seconds since epoch)
        // e.g. Math.floor(Date.now() / 1000) + 90 * 86400
        require(tx.time >= unlockTime);

        // ACTION: Send BCH to recipient
        require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(recipientHash));
        require(tx.outputs[0].value >= tx.inputs[0].value - 1000);
    }
}
```

2. The source was sent to `POST /api/compile`. The `cashc@0.10.0` CLI compiled it and returned a full artifact with bytecode.

3. The artifact was sent to `POST /api/deploy` with constructor args:
   - `recipientHash` = `cc81d50aa7f735189fb8978e3f1f7ceb9d41d2a3`
   - `unlockTime` = `1740356471` (Unix timestamp ~2 minutes in the future at time of deploy)

4. The deploy endpoint instantiated a CashScript `Contract` object and derived the P2SH32 contract address:

   ```
   bchtest:pvddkqflks070chjlgllr3x2rsr6w5hzkkupywq80e2xlpuvgmg5sedya2dw8
   ```

5. A P2PKH → P2SH32 funding transaction was broadcast from the wallet, sending **10 000 sat** to the contract:

   ```
   tx: c447d74fcf2fa4a06848fec15fd934aa36235fabf729aa09c6c05fbe3f01f7f3
   ```

6. The contract balance was confirmed via `GET /api/balance` (live ElectrumX query to chipnet):

   ```
   10 000 sat
   ```

### End-to-end trace

| Step | Input | Output |
|---|---|---|
| Block graph compile | `TIME_PASSED → SEND_BCH` | Valid `.cash` source (shown above) |
| `cashc` compile | `.cash` source | Artifact JSON with bytecode |
| Deploy | Artifact + `recipientHash` + `unlockTime` | Contract address (P2SH32, chipnet) |
| Fund | 10 000 sat from wallet | Tx `c447d74f…` broadcast |
| Balance check | Contract address | **10 000 sat** in mempool |

### Key addresses

| Entity | Chipnet Address |
|---|---|
| Wallet | `bchtest:qrxgr4g25lmn2xylhztcu0cl0n4e6swj5v5sf5g9s7` |
| Vesting contract | `bchtest:pvddkqflks070chjlgllr3x2rsr6w5hzkkupywq80e2xlpuvgmg5sedya2dw8` |

### What this proves

- The block-graph compiler produces CashScript that `cashc` accepts without modification.
- The deploy endpoint correctly derives a deterministic P2SH32 address from the artifact and constructor args (no transaction needed — the address is a pure function of the contract code).
- The contract address is a real BCH chipnet script hash that can receive and hold funds.
- The ElectrumX balance query hits live chipnet nodes and reflects mempool state within seconds.

---

## Constructor Arguments

Constructor args are values baked into the contract at deploy time. They parameterize the contract without changing its bytecode logic.

| Arg name | Type | How to fill it |
|---|---|---|
| `recipientHash` | `bytes20` | Paste a chipnet cashaddr — the app converts it to a 20-byte hash automatically. Leave blank to use your wallet address. |
| `unlockTime` | `int` | Absolute Unix timestamp (seconds). The deploy panel pre-fills **now + 90 days**. Adjust if your Trigger uses a different day count: `Math.floor(Date.now() / 1000) + <days> * 86400`. |
| `tokenCategory` | `bytes` | The 32-byte token category ID as a hex string. Find it in your token-issuance transaction. |
| `oraclePrice` | `int` | Current price in USD cents (oracle pattern — requires manual oracle integration for production). |
| `expectedHash` | `bytes` | 32-byte hash256 of the secret preimage (64 hex chars). Compute with `hash256(secret)` in any BCH tool before deploying. |
| `pk0`, `pk1`, … | `pubkey` | 33-byte compressed public keys (66 hex chars) for multisig contracts. |

> **Deduplication**: If two blocks both need `recipientHash`, the compiler only generates one constructor arg. Both outputs will use the same address. To send to two different addresses, use hardcoded hex in the block fields instead.

---

## Technical Foundations

### Project Layout

```
BCH1/
├── src/
│   ├── types/index.ts          # Shared types: BlockNode, BlockGraph, CompileResult
│   ├── compiler/
│   │   ├── BlockGraphCompiler.ts  # Pure TS: BlockGraph → .cash string
│   │   ├── templates.ts           # CashScript snippets per block type
│   │   ├── parser.ts              # Blockly workspace → BlockGraph IR
│   │   └── address.ts             # cashaddr → bytes20 normalizer
│   ├── blocks/
│   │   ├── definitions/        # Blockly JSON block definitions
│   │   ├── generators/         # Block → BlockNode converters
│   │   └── toolbox.ts          # Toolbox category configuration
│   ├── components/
│   │   ├── BlockCanvas.tsx     # Blockly workspace component
│   │   ├── CodePreview.tsx     # Live CashScript display
│   │   ├── DeployPanel.tsx     # Compile + deploy UI
│   │   ├── WalletPanel.tsx     # Wallet generation/import/balance
│   │   ├── InteractionsPanel.tsx  # Call deployed contract functions
│   │   └── WikiPage.tsx        # This wiki rendered in-app
│   ├── services/
│   │   ├── compile.ts          # POST /api/compile client
│   │   ├── network.ts          # POST /api/deploy client
│   │   ├── wallet.ts           # /api/wallet/* clients
│   │   └── deployments.ts      # localStorage deployment history
│   └── App.tsx                 # 3-column layout + state
├── server/
│   ├── index.ts                # Express entry point + CORS
│   ├── compile.ts              # cashc CLI wrapper (temp file + UUID)
│   ├── deploy.ts               # Contract instantiation + balance
│   ├── wallet.ts               # Wallet generation/import endpoints
│   ├── network.ts              # ElectrumNetworkProvider per network
│   └── interact.ts             # Contract function call endpoint
├── contracts/examples/         # Pre-built workspace JSON files
├── test/                       # Node-based integration tests
├── package.json
└── vite.config.ts              # esnext target, /api proxy
```

### Compiler Pipeline

The compiler is entirely **pure TypeScript** — no network calls, no DOM, no side effects. It can be unit-tested in isolation.

```
Blockly workspace
       │
       ▼ parser.ts
   BlockGraph IR
  (nodes + edges)
       │
       ▼ BlockGraphCompiler.ts
  1. validateGraph()     — exactly one trigger, at least one action
  2. sortNodes()         — DFS from trigger, topological order
  3. collectConstructorArgs() — deduplicated arg list from all nodes
  4. needsSignature()    — determines function signature (sig/multisig)
  5. generateFunctionBody()   — maps each node to a CashScript snippet
       │  ├─ Trigger/Action/State → getBlockTemplate()
       │  └─ IF_ELSE → inline if/else with branch subtrees
       │
       ▼ templates.ts
  CashScript snippets per block
       │
       ▼
  Assembled .cash source string
```

**IF_ELSE handling in detail:**

The parser's `extractConditionExpr()` recursively traverses the CONDITION value input of an IF_ELSE block, resolving AND/OR/COMPARE_VALUE into a CashScript boolean expression string (e.g., `(tx.inputs[0].value > 50000 && tx.inputs[0].value < 200000)`). This expression is stored in the node's `params.conditionExpr`.

During code generation, `generateFunctionBody` pre-computes which nodes belong to THEN/ELSE branches and skips them in the main loop. When it reaches the IF_ELSE node, it generates the `if/else` wrapper and calls `generateBranchCode` to emit the branch bodies with correct indentation.

**Output index tracking:**

`SPLIT_PERCENT` does not advance the output index counter. It adds value constraints to outputs N and N+1, but the subsequent `SEND_*` blocks each claim one output slot in order. This means the two `SEND_*` blocks after a split always constrain the same output indices that the split's value checks target.

### Backend Services

All blockchain-facing work runs on the Express server (port 3001) to avoid browser security restrictions.

| Endpoint | Method | What it does |
|---|---|---|
| `/api/compile` | POST | Writes source to `/tmp/cb-<uuid>.cash`, runs `npx cashc@0.10.0`, returns JSON artifact. Always cleans up temp files. |
| `/api/deploy` | POST | Instantiates `new Contract(artifact, args, { provider })` and returns the P2SH32 chipnet address. No transaction is broadcast at this step. |
| `/api/balance` | GET | Fetches UTXOs for an address via `ElectrumNetworkProvider` and sums satoshis. |
| `/api/wallet/generate` | POST | Generates a secp256k1 keypair, returns address + WIF. |
| `/api/wallet/import` | POST | Derives address from a WIF private key. |
| `/api/contract/interact` | POST | Signs and broadcasts a contract function call using the provided WIF + artifact + args. |

Network providers are cached per network in a `Map<Network, ElectrumNetworkProvider>`. Supported networks: `MAINNET`, `TESTNET3`, `TESTNET4`, `CHIPNET` (default).

> **Deploy vs Fund**: Deploying a contract only derives its P2SH32 address — it does not broadcast a transaction. To fund the contract, send BCH (and/or tokens) to that address from your wallet. The contract becomes spendable once funded.

---

## Advanced Usage & Tips

**Building a conditional contract:**

1. Drop a Trigger block (e.g., BCH_RECEIVED).
2. Drop an IF_ELSE block below it.
3. Drag a COMPARE_VALUE block into the IF_ELSE CONDITION socket.
4. Drop a SEND_BCH into the THEN slot and a SEND_BACK into the ELSE slot.
5. The generated `if/else` in CashScript enforces the split behavior on-chain.

**Combining AND / OR:**

- Drag an AND block into the IF_ELSE CONDITION socket.
- Drag two COMPARE_VALUE blocks into the AND's A and B sockets.
- The compiler resolves this into `(tx.inputs[0].value > X && tx.inputs[0].value < Y)`.
- OR works the same way with `||`.

**Hardcoding vs constructor args:**

If you fill in the `RECIPIENT_HASH` field directly on a SEND_BCH block, the address is inlined as a literal in the bytecode (cheaper, more rigid). If you leave the field blank, it becomes a `recipientHash` constructor arg you provide at deploy time (more flexible, slightly more bytecode).

**Multiple token types:**

Use multiple SEND_TOKEN blocks with different `categoryHex` values. The compiler deduplicates constructor args by name, so give each block a unique field value rather than relying on generated arg names.

**Checking deploy history:**

The Deploy panel saves every deployment to `localStorage` keyed by network. Switch networks in the header dropdown to see deployments on that network. The Interact panel reads from this same history.

**TypeScript strict mode:**

The entire codebase runs under `"strict": true`. All satoshi and token amounts use `bigint` — never `number`. Run `npm run typecheck` to verify before submitting.

**Testing:**

```bash
npm run test:oracle   # Oracle-managed contract: signatures, freshness, covenant outputs
npm run test:payout   # Payout-and-relock covenant: owner sig, output counts, max fee
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| CashScript preview is empty | No trigger block or no action block connected | Every contract needs at least one Trigger and one Action. Check the status card in the left sidebar for a specific error message. |
| Preview shows only comments, no `require()` | Logic-only blocks (AND/OR) placed in the main chain instead of as value inputs | AND/OR/COMPARE_VALUE are value blocks — connect them to an IF_ELSE CONDITION socket, not the main block chain. |
| `cashc` compile error: `0x` literal | Token block with empty `categoryHex` field and no constructor arg provided | Leave the field blank (the compiler generates a `tokenCategory` constructor arg) or enter a valid 64-character hex string. |
| Deploy button is grey / disabled | No wallet loaded, or contract has compile errors | Generate or import a wallet in the left sidebar. Resolve any red errors in the CashScript preview. Both must be satisfied before deploy is enabled. |
| `unlockTime` too small — contract spends immediately | `unlockTime` was set to a relative offset (e.g. 7776000) instead of an absolute timestamp | The value must be a Unix timestamp. The deploy panel pre-fills `Math.floor(Date.now() / 1000) + 90 * 86400`. Adjust the day count to match your Trigger block. |
| Token Split template doesn't compile | Chain ends at SPLIT_PERCENT with no SEND_TOKEN blocks following | SPLIT_PERCENT must be followed by two SEND_* blocks. The template is pre-built correctly — if you modified it, re-load from the Templates dropdown. |
| `/api/compile` returns version mismatch | Wrong `cashc` version on PATH | The server pins `npx cashc@0.10.0`. Run `npm install` and ensure no global `cashc` shadows it. |
| Balance stuck at "…" or shows 0 unexpectedly | Chipnet Electrum node unreachable | Check internet connectivity. Chipnet nodes can be transiently offline. Wait 30 seconds and open/close the wallet panel to retry. |
| Recurring payment contract: cashc type error on SEND_BACK | `LockingBytecodeP2SH32` received `bytes` instead of `bytes32` | Template correctly uses `new LockingBytecodeP2SH32(hash256(this.activeBytecode))`. `hash256` converts the variable-length redeem script to the required 32-byte hash. Re-load the template from the dropdown if you have a custom version. |
| Interact panel shows no contracts | No deployments recorded for the current network | Switch to the network you deployed on (header dropdown) or deploy a new contract first. |

---

Need help beyond this wiki? Open an issue or reach out via the hackathon support channels.
