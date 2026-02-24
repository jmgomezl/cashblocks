// Wallet service - HD wallet generation and management

interface WalletData {
  mnemonic: string;
  privateKeyWif: string;
  publicKeyHex: string;
  address: string;
  cashAddress: string;
}

interface StoredWallet {
  address: string;
  cashAddress: string;
  publicKeyHex: string;
  privateKeyWif?: string;
}

const WALLET_STORAGE_KEY_PREFIX = 'cashblocks_wallet';

function getStorageKey(network: string): string {
  return `${WALLET_STORAGE_KEY_PREFIX}_${network}`;
}

// Generate a new wallet via backend
export async function generateWallet(network: string): Promise<WalletData> {
  const response = await fetch('/api/wallet/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ network }),
  });

  const data = await response.json() as Record<string, unknown>;

  if (!response.ok || data.error) {
    throw new Error(String(data.error) || 'Failed to generate wallet');
  }

  // Ensure all fields are strings
  return {
    mnemonic: String(data.mnemonic || ''),
    privateKeyWif: String(data.privateKeyWif || ''),
    publicKeyHex: String(data.publicKeyHex || ''),
    address: String(data.address || ''),
    cashAddress: String(data.cashAddress || ''),
  };
}

// Import wallet from WIF private key
export async function importWalletFromWif(wif: string, network: string): Promise<WalletData> {
  const response = await fetch('/api/wallet/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wif, network }),
  });

  const data = await response.json() as Record<string, unknown>;

  if (!response.ok || data.error) {
    throw new Error(String(data.error) || 'Failed to import wallet');
  }

  return {
    mnemonic: String(data.mnemonic || ''),
    privateKeyWif: String(data.privateKeyWif || ''),
    publicKeyHex: String(data.publicKeyHex || ''),
    address: String(data.address || ''),
    cashAddress: String(data.cashAddress || ''),
  };
}

// Save wallet to localStorage
export function saveWallet(wallet: WalletData, savePrivateKey: boolean, network: string): void {
  const stored: StoredWallet = {
    address: String(wallet.address),
    cashAddress: String(wallet.cashAddress),
    publicKeyHex: String(wallet.publicKeyHex),
  };

  if (savePrivateKey && wallet.privateKeyWif) {
    stored.privateKeyWif = String(wallet.privateKeyWif);
  }

  localStorage.setItem(getStorageKey(network), JSON.stringify(stored));
}

// Load wallet from localStorage
export function loadWallet(network: string): StoredWallet | null {
  const stored = localStorage.getItem(getStorageKey(network));
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    // Ensure all fields are strings
    return {
      address: String(parsed.address || ''),
      cashAddress: String(parsed.cashAddress || ''),
      publicKeyHex: String(parsed.publicKeyHex || ''),
      privateKeyWif: parsed.privateKeyWif ? String(parsed.privateKeyWif) : undefined,
    };
  } catch {
    return null;
  }
}

// Clear wallet from localStorage
export function clearWallet(network: string): void {
  localStorage.removeItem(getStorageKey(network));
}

// Get wallet balance
export async function getWalletBalance(address: string, network: string): Promise<{
  confirmed: bigint;
  unconfirmed: bigint;
  utxos: number;
}> {
  const response = await fetch(`/api/wallet/balance?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}`);
  const data = await response.json() as Record<string, unknown>;

  if (!response.ok || data.error) {
    throw new Error(String(data.error) || 'Failed to get balance');
  }

  return {
    confirmed: BigInt(String(data.confirmed || '0')),
    unconfirmed: BigInt(String(data.unconfirmed || '0')),
    utxos: Number(data.utxos || 0),
  };
}

// Sign a message with wallet
export async function signMessage(message: string, privateKeyWif: string): Promise<string> {
  const response = await fetch('/api/wallet/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, privateKeyWif }),
  });

  const data = await response.json() as Record<string, unknown>;

  if (!response.ok || data.error) {
    throw new Error(String(data.error) || 'Signing failed');
  }

  return String(data.signature || '');
}
