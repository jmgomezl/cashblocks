import {
  generatePrivateKey,
  secp256k1,
  encodeCashAddress,
  hash160,
  CashAddressNetworkPrefix,
  CashAddressType,
  encodePrivateKeyWif,
  decodePrivateKeyWif,
  sha256,
} from '@bitauth/libauth';
import { ElectrumNetworkProvider, Network } from 'cashscript';
import * as crypto from 'crypto';

const providerCache = new Map<Network, ElectrumNetworkProvider>();

function getProvider(network: Network): ElectrumNetworkProvider {
  if (!providerCache.has(network)) {
    providerCache.set(network, new ElectrumNetworkProvider(network));
  }
  return providerCache.get(network)!;
}

function getNetworkEncoding(network: Network): { prefix: CashAddressNetworkPrefix; wif: 'mainnet' | 'testnet' } {
  switch (network) {
    case Network.MAINNET:
      return { prefix: CashAddressNetworkPrefix.mainnet, wif: 'mainnet' };
    case Network.TESTNET3:
    case Network.TESTNET4:
    case Network.CHIPNET:
    default:
      return { prefix: CashAddressNetworkPrefix.testnet, wif: 'testnet' };
  }
}

// Generate BIP39-like mnemonic (simplified - use proper BIP39 in production)
function generateMnemonic(): string {
  const words = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
    'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
    'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
    'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
    'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
    'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
    'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
    'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
    'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
    'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
    'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
    'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
  ];

  const selected: string[] = [];
  for (let i = 0; i < 12; i++) {
    const randomIndex = crypto.randomInt(0, words.length);
    selected.push(words[randomIndex]);
  }
  return selected.join(' ');
}

interface WalletData {
  mnemonic: string;
  privateKeyWif: string;
  publicKeyHex: string;
  address: string;
  cashAddress: string;
}

// Helper to get CashAddress string from result
function getCashAddressString(prefix: string, type: CashAddressType, payload: Uint8Array): string {
  const result = encodeCashAddress({
    prefix: prefix as CashAddressNetworkPrefix,
    type: type,
    payload: payload,
  });

  if (typeof result === 'string') {
    return result;
  }

  // If result is an object with address property
  if (result && typeof result === 'object' && 'address' in result) {
    return (result as { address: string }).address;
  }

  throw new Error('Failed to encode cash address');
}

// Generate a new wallet
export async function generateWallet(network: Network): Promise<WalletData> {
  // Generate random private key
  const privateKey = generatePrivateKey(() => crypto.randomBytes(32));

  // Derive public key
  const publicKeyResult = secp256k1.derivePublicKeyCompressed(privateKey);
  if (typeof publicKeyResult === 'string') {
    throw new Error('Failed to derive public key: ' + publicKeyResult);
  }
  const publicKey = publicKeyResult;

  // Hash public key for address
  const pubKeyHashResult = hash160(publicKey);
  if (typeof pubKeyHashResult === 'string') {
    throw new Error('Failed to hash public key');
  }
  const pubKeyHash = pubKeyHashResult;

  const networkConfig = getNetworkEncoding(network);

  // Create CashAddress with network prefix
  const cashAddress = getCashAddressString(networkConfig.prefix, CashAddressType.p2pkh, pubKeyHash);

  // Encode private key as WIF
  const wif = encodePrivateKeyWif(privateKey, networkConfig.wif);

  // Generate mnemonic for backup
  const mnemonic = generateMnemonic();

  return {
    mnemonic,
    privateKeyWif: wif,
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
    address: Buffer.from(pubKeyHash).toString('hex'),
    cashAddress,
  };
}

// Import wallet from WIF
export async function importFromWif(wif: string, network: Network): Promise<WalletData> {
  const decoded = decodePrivateKeyWif(wif);

  if (typeof decoded === 'string') {
    throw new Error('Invalid WIF: ' + decoded);
  }

  const privateKey = decoded.privateKey;

  // Derive public key
  const publicKeyResult = secp256k1.derivePublicKeyCompressed(privateKey);
  if (typeof publicKeyResult === 'string') {
    throw new Error('Failed to derive public key');
  }
  const publicKey = publicKeyResult;

  // Hash public key
  const pubKeyHashResult = hash160(publicKey);
  if (typeof pubKeyHashResult === 'string') {
    throw new Error('Failed to hash public key');
  }
  const pubKeyHash = pubKeyHashResult;

  const networkConfig = getNetworkEncoding(network);

  // Create CashAddress
  const cashAddress = getCashAddressString(networkConfig.prefix, CashAddressType.p2pkh, pubKeyHash);

  return {
    mnemonic: '(imported from WIF)',
    privateKeyWif: wif,
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
    address: Buffer.from(pubKeyHash).toString('hex'),
    cashAddress,
  };
}

// Get wallet balance
export async function getWalletBalance(address: string, network: Network): Promise<{
  confirmed: string;
  unconfirmed: string;
  utxos: number;
}> {
  const networkProvider = getProvider(network);
  const utxos = await networkProvider.getUtxos(address);

  const confirmed = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);

  return {
    confirmed: confirmed.toString(),
    unconfirmed: '0',
    utxos: utxos.length,
  };
}

// Sign message with private key
export async function signMessage(message: string, wif: string): Promise<string> {
  const decoded = decodePrivateKeyWif(wif);
  if (typeof decoded === 'string') {
    throw new Error('Invalid WIF');
  }

  const messageHash = sha256.hash(new TextEncoder().encode(message));
  if (typeof messageHash === 'string') {
    throw new Error('Hash failed');
  }

  const signatureResult = secp256k1.signMessageHashSchnorr(decoded.privateKey, messageHash);
  if (typeof signatureResult === 'string') {
    throw new Error('Signing failed: ' + signatureResult);
  }

  return Buffer.from(signatureResult).toString('hex');
}

// No faucet integration: keep logic server-side for balance + wallet only
