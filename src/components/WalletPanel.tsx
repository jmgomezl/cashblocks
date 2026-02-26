import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  generateWallet,
  importWalletFromWif,
  saveWallet,
  loadWallet,
  clearWallet,
  getWalletBalance,
} from '../services/wallet';

interface WalletInfo {
  address: string;
  cashAddress: string;
  publicKeyHex: string;
  privateKeyWif?: string;
  mnemonic?: string;
}

interface WalletPanelProps {
  network: string;
  networkLabel: string;
  onWalletChange?: (wallet: WalletInfo | null) => void;
}

export default function WalletPanel({ network, networkLabel, onWalletChange }: WalletPanelProps): JSX.Element {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [balance, setBalance] = useState<{ confirmed: bigint; utxos: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [importWif, setImportWif] = useState('');
  const [showImport, setShowImport] = useState(false);
  const faucetUrl = 'https://tbch.googol.cash/';
  const isMainnet = network === 'MAINNET';

  // Load wallet from storage on mount
  useEffect(() => {
    const stored = loadWallet(network);
    if (stored && stored.cashAddress) {
      setWallet({
        address: stored.address,
        cashAddress: stored.cashAddress,
        publicKeyHex: stored.publicKeyHex,
        privateKeyWif: stored.privateKeyWif,
      });
    } else {
      setWallet(null);
    }
  }, [network]);

  // Notify parent of wallet changes
  useEffect(() => {
    onWalletChange?.(wallet);
  }, [wallet, onWalletChange]);

  // Fetch balance when wallet changes
  useEffect(() => {
    if (!wallet) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const bal = await getWalletBalance(wallet.cashAddress, network);
        setBalance({ confirmed: bal.confirmed, utxos: bal.utxos });
      } catch (err) {
        console.error('Failed to fetch balance:', err);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [wallet, network]);

  const handleGenerateWallet = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const newWallet = await generateWallet(network);
      setWallet(newWallet);
      saveWallet(newWallet, true, network); // Save with private key
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [network]);

  const handleImportWallet = useCallback(async () => {
    if (!importWif.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const imported = await importWalletFromWif(importWif.trim(), network);
      setWallet(imported);
      saveWallet(imported, true, network);
      setImportWif('');
      setShowImport(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [importWif, network]);

  const handleDisconnect = useCallback(() => {
    clearWallet(network);
    setWallet(null);
    setBalance(null);
  }, [network]);

  const formatBalance = (sats: bigint): string => {
    const bch = Number(sats) / 100_000_000;
    return `${bch.toFixed(8)} ${isMainnet ? 'BCH' : 'tBCH'}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: '#16213e',
        borderRadius: '8px',
        color: '#eaeaea',
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', color: '#00d4aa', fontSize: '14px' }}>
        Wallet ({networkLabel})
      </h3>

      {error && (
        <div
          style={{
            padding: '8px',
            backgroundColor: '#ff6b6b22',
            border: '1px solid #ff6b6b',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '12px',
            color: '#ff6b6b',
          }}
        >
          {error}
        </div>
      )}

      {!wallet ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={handleGenerateWallet}
            disabled={isLoading}
            style={{
              padding: '12px',
              backgroundColor: '#00d4aa',
              color: '#16213e',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: isLoading ? 'wait' : 'pointer',
            }}
          >
            {isLoading ? 'Generating...' : 'Create New Wallet'}
          </button>

          <button
            onClick={() => setShowImport(!showImport)}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              color: '#888',
              border: '1px solid #333',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {showImport ? 'Cancel' : 'Import from WIF'}
          </button>

          {showImport && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="password"
                value={importWif}
                onChange={(e) => setImportWif(e.target.value)}
                placeholder="Enter WIF private key"
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: '#252538',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  color: '#eaeaea',
                  fontSize: '12px',
                }}
              />
              <button
                onClick={handleImportWallet}
                disabled={isLoading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#00d4aa',
                  color: '#16213e',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Import
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* QR Code */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '12px',
              backgroundColor: 'white',
              borderRadius: '8px',
            }}
          >
            <QRCodeSVG value={wallet.cashAddress} size={100} />
          </div>

          {/* Address */}
          <div>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
              Address (Chipnet)
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <div
                style={{
                  flex: 1,
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  backgroundColor: '#252538',
                  padding: '8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={() => copyToClipboard(wallet.cashAddress)}
                title="Click to copy"
              >
                {wallet.cashAddress}
              </div>
              <button
                onClick={() => copyToClipboard(wallet.cashAddress)}
                style={{
                  padding: '0 10px',
                  backgroundColor: '#333',
                  color: '#eaeaea',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Copy
              </button>
            </div>
          </div>

          {/* Public Key */}
          <div>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
              Public Key (use as <code style={{ fontSize: '10px', color: '#00d4aa' }}>pk</code> in Interact)
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <div
                style={{
                  flex: 1,
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  backgroundColor: '#252538',
                  padding: '8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: '#aaa',
                }}
                onClick={() => copyToClipboard(wallet.publicKeyHex)}
                title="Click to copy"
              >
                {wallet.publicKeyHex}
              </div>
              <button
                onClick={() => copyToClipboard(wallet.publicKeyHex)}
                style={{
                  padding: '0 10px',
                  backgroundColor: '#333',
                  color: '#eaeaea',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Copy
              </button>
            </div>
          </div>

          {/* Balance */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px',
              backgroundColor: '#252538',
              borderRadius: '4px',
            }}
          >
            <div>
              <div style={{ fontSize: '10px', color: '#888' }}>Balance</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#00d4aa' }}>
                {balance ? formatBalance(balance.confirmed) : '...'}
              </div>
            </div>
            <div style={{ fontSize: '10px', color: '#666' }}>
              {balance ? `${balance.utxos} UTXOs` : ''}
            </div>
          </div>

          {/* Faucet instructions */}
          {!isMainnet ? (
            <div
              style={{
                padding: '12px',
                backgroundColor: '#252538',
                border: '1px dashed #444',
                borderRadius: '4px',
                fontSize: '11px',
                lineHeight: 1.4,
              }}
            >
              Need testnet coins? Visit{' '}
              <a
                href={faucetUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#00d4aa' }}
              >
                tbch.googol.cash
              </a>{' '}
              and paste your address ({wallet.cashAddress.slice(0, 12)}...).
            </div>
          ) : (
            <div
              style={{
                padding: '12px',
                backgroundColor: '#252538',
                border: '1px dashed #444',
                borderRadius: '4px',
                fontSize: '11px',
                lineHeight: 1.4,
              }}
            >
              Mainnet selected. Ensure you control your keys and fund the wallet externally.
            </div>
          )}

          {/* Private Key */}
          {wallet.privateKeyWif && (
            <div>
              <button
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  color: '#ff6b6b',
                  border: '1px solid #ff6b6b',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {showPrivateKey ? 'Hide Private Key' : 'Show Private Key (Danger!)'}
              </button>
              {showPrivateKey && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '8px',
                    backgroundColor: '#ff6b6b22',
                    border: '1px solid #ff6b6b',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                  }}
                >
                  {wallet.privateKeyWif}
                </div>
              )}
            </div>
          )}

          {/* Disconnect */}
          <button
            onClick={handleDisconnect}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              color: '#666',
              border: '1px solid #333',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Disconnect Wallet
          </button>
        </div>
      )}
    </div>
  );
}
