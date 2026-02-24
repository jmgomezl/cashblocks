# CLAUDE.md — CashBlocks

## Mission
Build CashBlocks: a visual drag-and-drop programming environment for Bitcoin Cash smart
contracts. Think MIT App Inventor, but for BCH covenants and CashTokens.

Users snap together visual blocks (Trigger → Logic → Action) in a browser canvas.
The system compiles their block graph into valid CashScript source code.
One-click deploy to BCH chipnet (testnet).

No CashScript knowledge required. This is the tool that opens BCH smart contracts
to every developer on earth, just in time for the CashVM upgrade.

---

## Stack
- *Frontend*: React + TypeScript + Blockly.js
- *Compiler*: Custom block-graph → CashScript transpiler (pure TypeScript)
- *BCH*: `cashscript` + `cashc` npm packages, ElectrumNetworkProvider, chipnet
- *Code Editor*: `@monaco-editor/react` (read-only CashScript preview)
- *Backend*: Node.js + Express (compile endpoint only)
- *Build*: Vite + `concurrently` for dev

---

## Project Structure

```
cashblocks/
├── CLAUDE.md
├── package.json
├── vite.config.ts
├── tsconfig.json
├── server/
│   ├── index.ts              ← Express server (port 3001)
│   └── compile.ts            ← POST /api/compile: .cash source → artifact JSON
├── src/
│   ├── main.tsx
│   ├── App.tsx               ← 3-panel layout
│   ├── types/
│   │   └── index.ts          ← Shared types: BlockNode, BlockGraph, CompileResult
│   ├── blocks/
│   │   ├── definitions/
│   │   │   ├── trigger.ts    ← TRIGGER block JSON definitions for Blockly
│   │   │   ├── logic.ts      ← LOGIC block JSON definitions
│   │   │   ├── action.ts     ← ACTION block JSON definitions
│   │   │   └── state.ts      ← STATE block JSON definitions
│   │   ├── generators/
│   │   │   ├── trigger.ts    ← Block → IR node generators
│   │   │   ├── logic.ts
│   │   │   ├── action.ts
│   │   │   └── state.ts
│   │   └── toolbox.ts        ← Blockly toolbox config (all 4 categories)
│   ├── compiler/
│   │   ├── BlockGraphCompiler.ts  ← Core: BlockGraph → .cash string (pure, no side effects)
│   │   ├── templates.ts           ← CashScript code templates per block type
│   │   └── parser.ts              ← Blockly workspace XML → BlockGraph IR
│   ├── components/
│   │   ├── BlockCanvas.tsx   ← Blockly workspace, fires onChange with BlockGraph
│   │   ├── CodePreview.tsx   ← Monaco editor, read-only, live CashScript output
│   │   └── DeployPanel.tsx   ← Deploy to chipnet, show address + QR
│   └── services/
│       ├── compile.ts        ← Calls POST /api/compile
│       └── network.ts        ← ElectrumNetworkProvider for chipnet
└── contracts/
    └── examples/
        ├── vesting.json           ← Blockly workspace export
        ├── recurring-payment.json
        └── token-split.json
```

---

## Block System

### TRIGGER Blocks (what activates the contract)
| Block | Parameters | CashScript Pattern |
|---|---|---|
| `BCH_RECEIVED` | minAmount (int) | `require(tx.inputs[0].value >= minAmount)` |
| `TOKEN_RECEIVED` | categoryHex (string) | token category check on input |
| `TIME_PASSED` | days (int) | `require(tx.time >= tx.inputs[0].sequenceNumber * 512)` |
| `MULTISIG_SIGNED` | required (int), total (int) | `checkMultiSig(sigs, pubkeys)` |
| `PRICE_ABOVE` | usdThreshold (int) | oracle datasig pattern |

### LOGIC Blocks (conditions / gates)
| Block | Parameters | CashScript Pattern |
|---|---|---|
| `IF_ELSE` | — | `if (...) { } else { }` |
| `AND` | — | `&&` |
| `OR` | — | `\|\|` |
| `COMPARE_VALUE` | operator, threshold | `amount > threshold` |
| `CHECK_ADDRESS` | — | `hash160(pk) == recipientHash` |

### ACTION Blocks (what the contract enforces as outputs)
| Block | Parameters | CashScript Pattern |
|---|---|---|
| `SEND_BCH` | recipientHash (bytes20) | `new LockingBytecodeP2PKH(recipientHash)` |
| `SEND_TOKEN` | recipientHash, categoryHex | token output covenant |
| `SPLIT_PERCENT` | percent (int 1-99) | two outputs, ratio enforced |
| `TIME_LOCK_OUTPUT` | days (int) | output with sequence number |
| `SEND_BACK` | — | `new LockingBytecodeP2SH32(this.activeBytecode)` |

### STATE Blocks (NFT commitment as on-chain storage)
| Block | Parameters | CashScript Pattern |
|---|---|---|
| `STORE_IN_NFT` | key (string) | write to `tx.outputs[0].nftCommitment` |
| `READ_FROM_NFT` | key (string) | read from `tx.inputs[0].nftCommitment` |
| `INCREMENT_COUNTER` | — | deserialize → increment → reserialize in commitment |

---

## Compiler Architecture (most critical component)

`BlockGraphCompiler.ts` is the heart of CashBlocks. It must be pure — no network
calls, no side effects.

### Input / Output
```typescript
// Input: IR graph produced by parser.ts from Blockly XML
interface BlockGraph {
  trigger: BlockNode;
  nodes: BlockNode[];
  edges: Edge[];
}

// Output: valid .cash source string
function compile(graph: BlockGraph): CompileResult {
  // returns { source: string, constructorArgs: ConstructorArg[], error?: string }
}
```

### Compilation Steps
1. Validate graph has exactly one TRIGGER root
2. Topological sort of nodes (trigger → logic → action)
3. Extract constructor arguments from block parameters
4. Map each node to its CashScript template from templates.ts
5. Assemble full contract: pragma → contract declaration → constructor args → function body
6. Return complete .cash source string

### CashScript Output Shape
```cashscript
pragma cashscript ^0.10.0;

contract GeneratedContract(
    bytes20 recipientHash,
    int threshold
) {
    function execute(sig s, pubkey pk) {
        // TRIGGER
        require(tx.inputs[0].value >= threshold);

        // LOGIC
        require(checkSig(s, pk));

        // ACTION: covenant enforcing output
        require(tx.outputs[0].lockingBytecode ==
            new LockingBytecodeP2PKH(recipientHash));
        require(tx.outputs[0].value >= tx.inputs[0].value - 1000);
    }
}
```

### Critical CashScript Rules
- All satoshi amounts are bigint — never number
- Use tx.inputs[0].value not tx.value (v0.10+ SDK)
- Covenants enforce outputs via tx.outputs[i].lockingBytecode equality
- this.activeBytecode is how contracts send back to themselves
- chipnet = Network.CHIPNET in ElectrumNetworkProvider
- Compile via cashc CLI, not programmatic API — write temp file, shell exec, read artifact

---

## Backend: Compile Endpoint

```typescript
// POST /api/compile
// Body: { source: string }
// Response: { artifact: object } | { error: string }

// Implementation:
// 1. Write source to /tmp/cb-{uuid}.cash
// 2. exec: cashc /tmp/cb-{uuid}.cash --output /tmp/cb-{uuid}.json
// 3. Read and return artifact JSON
// 4. Always cleanup temp files
```

---

## Three Demo Contracts

These are the hackathon demo. All three must compile and deploy to chipnet.

### 1. Vesting (the hero demo)
Blocks: BCH_RECEIVED → TIME_PASSED (90 days) → SEND_BCH (recipient)

```cashscript
pragma cashscript ^0.10.0;
contract Vesting(bytes20 recipientHash, int unlockTime) {
    function release(sig s, pubkey pk) {
        require(tx.time >= unlockTime);
        require(checkSig(s, pk));
        require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(recipientHash));
        require(tx.outputs[0].value >= tx.inputs[0].value - 1000);
    }
}
```

### 2. Recurring Payment
Blocks: BCH_RECEIVED → TIME_PASSED (30 days) → SPLIT_PERCENT 10% → SEND_BCH + SEND_BACK
Pledge-style: sends 10% to recipient, 90% back to contract itself (resets 30-day timer).

### 3. Token Split
Blocks: TOKEN_RECEIVED → COMPARE_VALUE (> 100 tokens) → SPLIT_PERCENT 70/30 → SEND_TOKEN × 2
Enforces two token output amounts when input exceeds threshold.

---

## UI Layout

```
┌──────────────────────────┬─────────────────────┐
│                          │  CodePreview         │
│   BlockCanvas            │  (Monaco, read-only) │
│   (Blockly workspace)    │  live CashScript     │
│   60% width              ├─────────────────────┤
│                          │  DeployPanel         │
│                          │  chipnet deploy      │
│                          │  contract address    │
│                          │  QR code             │
└──────────────────────────┴─────────────────────┘
```

- CodePreview updates in real-time on every workspace change
- Compile errors shown inline in red in CodePreview
- DeployPanel disabled until compilation succeeds (no errors)
- "Load Example" dropdown in toolbar: loads the 3 demo contracts

---

## Rules
- TypeScript strict mode, no `any` anywhere
- `bigint` for all satoshi/token amounts — never `number`
- All Blockly block definitions use JSON format (not legacy XML format)
- Network is always chipnet — never mainnet, never regtest
- BlockGraphCompiler.ts must be pure (no I/O, no network, no side effects)
- Temp files in compile endpoint must use UUID to handle concurrent requests
- All errors must surface to the UI — no silent failures, no console-only errors
- Run `tsc --noEmit` after completing each file group before proceeding

---

## Install

```bash
npm install blockly cashscript cashc @monaco-editor/react express uuid
npm install -D vite @vitejs/plugin-react typescript tsx concurrently
npm install -D @types/node @types/express @types/uuid
```

---

## Scripts

```json
{
  "dev": "concurrently \"vite\" \"tsx watch server/index.ts\"",
  "build": "vite build",
  "typecheck": "tsc --noEmit"
}
```

---

## Definition of Done
1. `npm run dev` starts with zero errors, zero TypeScript errors
2. Blockly canvas renders with all 4 block categories in toolbox
3. Dragging blocks updates CodePreview in real-time
4. Vesting demo loads from JSON, compiles to valid CashScript
5. "Deploy" deploys vesting contract to chipnet, returns real address
6. All 3 demo contracts load, compile, and deploy successfully
7. Zero `any` types — `npm run typecheck` passes clean

---

## Session Log

### 2026-02-22
- Created full CLAUDE.md specification for CashBlocks
- Built complete project following 11-step order:
  1. package.json, vite.config.ts, tsconfig.json - DONE
  2. src/types/index.ts - DONE (BlockNode, BlockGraph, CompileResult, etc.)
  3. src/blocks/definitions/ (trigger.ts, logic.ts, action.ts, state.ts) - DONE
  4. src/compiler/templates.ts, parser.ts, BlockGraphCompiler.ts - DONE (core compiler)
  5. server/index.ts, server/compile.ts - DONE (Express + cashc CLI integration)
  6. src/blocks/generators/ + toolbox.ts - DONE
  7. src/components/BlockCanvas.tsx - DONE (Blockly workspace)
  8. src/components/CodePreview.tsx - DONE (Monaco editor)
  9. src/components/DeployPanel.tsx + services - DONE (chipnet deploy)
  10. src/App.tsx + src/main.tsx - DONE (3-panel layout)
  11. contracts/examples/ (vesting.json, recurring-payment.json, token-split.json) - DONE

- Fixed Blockly type definitions (custom BlockJson interface)
- Fixed Vite config for esnext target (top-level await support for @bitauth/libauth)
- All TypeScript checks pass (npm run typecheck)
- Dev server starts clean (npm run dev)

## Files Created
- package.json (deps: blockly, cashscript, @monaco-editor/react, express, qrcode.react)
- vite.config.ts (esnext target, API proxy)
- tsconfig.json (strict mode)
- index.html
- src/types/index.ts
- src/blocks/definitions/{trigger,logic,action,state}.ts
- src/blocks/generators/{trigger,logic,action,state}.ts
- src/blocks/toolbox.ts
- src/compiler/{templates,parser,BlockGraphCompiler}.ts
- src/components/{BlockCanvas,CodePreview,DeployPanel}.tsx
- src/services/{compile,network}.ts
- src/App.tsx, src/main.tsx
- server/{index,compile}.ts
- contracts/examples/{vesting,recurring-payment,token-split}.json

## Key Implementation Details
- BlockGraphCompiler.ts is pure (no side effects, no I/O)
- All satoshi amounts use bigint
- Compilation uses cashc CLI via temp files with UUID
- Network always chipnet via ElectrumNetworkProvider
- Blockly blocks use JSON definition format

## Fixes Applied (Session 2)
- Fixed Blockly import: `import * as Blockly from 'blockly/core'` for block registration
- Fixed Monaco/Blockly AMD conflict: replaced Monaco with simple textarea in CodePreview
- Fixed cashscript browser incompatibility: moved ElectrumNetworkProvider to server-side
- Added server/deploy.ts with /api/deploy and /api/balance endpoints
- Added React ErrorBoundary in main.tsx for better error display
- Added Playwright test (test-browser.mjs) for automated browser testing
- Build and typecheck both pass, browser test confirms page loads correctly

## Session 3 - Wallet Integration & Real Deployment

### New Features Added:
1. **Wallet System** (WalletPanel.tsx + server/wallet.ts)
   - Generate new HD wallets with mnemonic backup
   - Import wallets from WIF private key
   - Secure key storage in localStorage
   - Real-time balance display (auto-refresh every 10s)
   - QR code for receiving funds
   - Show/hide private key option

2. **Faucet Integration**
   - One-click testnet coin request
   - Links to chipnet faucet (tbch4.googol.cash)
   - Displays transaction status

3. **Enhanced Deploy Panel**
   - Constructor argument input fields
   - Auto-fill recipientHash from wallet address
   - Real-time validation
   - Post-deployment contract address display

4. **New API Endpoints**
   - POST /api/wallet/generate - Create new wallet
   - POST /api/wallet/import - Import from WIF
   - GET /api/wallet/balance - Get address balance
   - POST /api/wallet/sign - Sign messages
   - POST /api/faucet/request - Request testnet coins

5. **UI Improvements**
   - New 3-column layout (Wallet | Canvas | Code+Deploy)
   - Network badge showing "Chipnet (Testnet)"
   - Contract status indicator
   - Footer with version info

### Files Added/Modified:
- src/services/wallet.ts - Frontend wallet service
- src/components/WalletPanel.tsx - Wallet UI component
- server/wallet.ts - Backend wallet operations
- server/index.ts - Added wallet endpoints
- src/App.tsx - New layout with wallet sidebar
- src/components/DeployPanel.tsx - Constructor arg inputs

### Verified Working:
- Browser test passes (Playwright)
- Wallet generation API works
- Build completes successfully
- TypeScript strict mode passes

## Next Steps / TODOs
- Add contract interaction (call functions after deploy)
- Add transaction history
- Add shareable contract links
- Add more block types (NFT minting, escrow patterns)
- Add mainnet toggle (with warnings)
- Add export to CashScript file
