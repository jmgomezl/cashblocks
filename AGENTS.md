# Repository Guidelines

## Project Structure & Module Organization
The frontend lives in `src/` (React + TypeScript), with visual blocks under `src/blocks`, compiler logic in `src/compiler`, and UI panels in `src/components`. Shared types sit in `src/types`, while `src/services` houses API clients for compilation, deployment, and wallets. The Express backend is under `server/` (`index.ts` wires routes, `compile.ts` and `deploy.ts` encapsulate BCH logic, `wallet.ts` handles key operations). Example Blockly workspaces are stored in `contracts/examples/`; production bundles land in `dist/`.

## Build, Test, and Development Commands
Run `npm install` to fetch dependencies. Use `npm run dev` to start Vite (5173) alongside the Express API (3001). `npm run build` produces the bundle in `dist/`, and `npm run typecheck` enforces strict TypeScript rules without emitting files. For a quick browser sanity test, keep the dev server running and execute `node test-browser.mjs`; it launches Playwright, loads the app, and fails on console errors or missing Blockly canvas.

## Coding Style & Naming Conventions
Favor React function components with hooks; class components stay limited to infrastructure like `ErrorBoundary`. Use TypeScript strictly—avoid `any`, prefer interfaces from `src/types`. Files are camelCase for modules (`network.ts`) and PascalCase for components (`DeployPanel.tsx`). Stick to two-space indentation, trailing commas on multi-line objects, and template literals for generated CashScript code. Add inline comments only when explaining non-obvious blockchain or compiler behavior, and isolate cashscript interactions inside service modules.

## Testing Guidelines
Treat `npm run typecheck` as the minimum CI gate. Before sharing contracts, load the sample templates and confirm the CashScript preview updates without errors. When touching UI wiring, run `node test-browser.mjs` to ensure the page mounts without console exceptions. Wallet or deployment changes should be smoke-tested against chipnet with the in-app wallet; confirm faucet guidance and balance polling still work. Aim for deterministic compiler output (same block graph → identical source) and document new invariants in PRs.

## Commit & Pull Request Guidelines
Use short, imperative commit messages ("fix split percent outputs", "add wallet faucet status") and keep each commit focused. Describe the motivation, highlight touched areas (compiler, blocks, wallet, server), and list manual or automated checks in every PR. Include screenshots or GIFs for UI changes and state any blockchain network assumptions (chipnet only, faucet mocks) so reviewers can verify safely.
