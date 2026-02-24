import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { compileCashScript, validateCompileRequest } from './compile.js';
import { deployToNetwork, getBalance, validateDeployRequest } from './deploy.js';
import {
  generateWallet,
  importFromWif,
  getWalletBalance,
  signMessage,
} from './wallet.js';
import { resolveNetworkParam } from './network.js';
import { interactWithContract, validateInteractionRequest } from './interact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Middleware
app.use(express.json());

// CORS for development
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    defaultNetwork: 'chipnet',
    supportedNetworks: ['MAINNET', 'TESTNET3', 'TESTNET4', 'CHIPNET'],
  });
});

// ============ COMPILE ENDPOINTS ============

app.post('/api/compile', async (req, res) => {
  const compileRequest = validateCompileRequest(req.body);

  if (!compileRequest) {
    res.status(400).json({ error: 'Invalid request: source is required' });
    return;
  }

  const result = await compileCashScript(compileRequest.source);

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ artifact: result.artifact });
});

// ============ DEPLOY ENDPOINTS ============

app.post('/api/deploy', async (req, res) => {
  const deployRequest = validateDeployRequest(req.body);

  if (!deployRequest) {
    res.status(400).json({ error: 'Invalid request: artifact and constructorArgs required' });
    return;
  }

  const { network: networkName } = req.body as { network?: string };
  const network = resolveNetworkParam(networkName);
  const result = await deployToNetwork(deployRequest, network);

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ address: result.address });
});

app.get('/api/balance', async (req, res) => {
  const address = req.query.address as string;
  const networkName = req.query.network as string | undefined;
  const network = resolveNetworkParam(networkName);

  if (!address) {
    res.status(400).json({ error: 'Address parameter required' });
    return;
  }

  const result = await getBalance(address, network);

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ balance: result.balance });
});

app.post('/api/contract/interact', async (req, res) => {
  const interactionRequest = validateInteractionRequest(req.body);

  if (!interactionRequest) {
    res.status(400).json({ error: 'Invalid interaction request' });
    return;
  }

  const network = resolveNetworkParam((req.body as { network?: string }).network);
  const result = await interactWithContract(interactionRequest, network);

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ txid: result.txid });
});

// ============ WALLET ENDPOINTS ============

// Generate new wallet
app.post('/api/wallet/generate', async (req, res) => {
  const { network: networkName } = req.body as { network?: string };
  const network = resolveNetworkParam(networkName);
  try {
    const wallet = await generateWallet(network);
    res.json(wallet);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

// Import wallet from WIF
app.post('/api/wallet/import', async (req, res) => {
  const { wif, network: networkName } = req.body as { wif?: string; network?: string };
  const network = resolveNetworkParam(networkName);

  if (!wif) {
    res.status(400).json({ error: 'WIF private key required' });
    return;
  }

  try {
    const wallet = await importFromWif(wif, network);
    res.json(wallet);
  } catch (err) {
    const error = err as Error;
    res.status(400).json({ error: error.message });
  }
});

// Get wallet balance
app.get('/api/wallet/balance', async (req, res) => {
  const address = req.query.address as string;
  const networkName = req.query.network as string | undefined;
  const network = resolveNetworkParam(networkName);

  if (!address) {
    res.status(400).json({ error: 'Address parameter required' });
    return;
  }

  try {
    const balance = await getWalletBalance(address, network);
    res.json(balance);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

// Sign message
app.post('/api/wallet/sign', async (req, res) => {
  const { message, privateKeyWif } = req.body as { message?: string; privateKeyWif?: string };

  if (!message || !privateKeyWif) {
    res.status(400).json({ error: 'Message and privateKeyWif required' });
    return;
  }

  try {
    const signature = await signMessage(message, privateKeyWif);
    res.json({ signature });
  } catch (err) {
    const error = err as Error;
    res.status(400).json({ error: error.message });
  }
});

// Serve built frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
// SPA fallback — all non-API routes serve index.html
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`CashBlocks server running on http://localhost:${PORT}`);
  console.log('Networks: MAINNET, TESTNET3, TESTNET4, CHIPNET (default chipnet)');
});
