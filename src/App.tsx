import { useState, useCallback, useRef, Suspense, lazy, useEffect } from 'react';
import { compile } from './compiler/BlockGraphCompiler';
import type { BlockGraph, CompileResult } from './types';
import WikiPage from './components/WikiPage';
import wikiContent from '../WIKI.md?raw';
import InteractionsPanel from './components/InteractionsPanel';
import { loadDeployments, StoredDeployment } from './services/deployments';

// Lazy load heavy components
const BlockCanvas = lazy(() => import('./components/BlockCanvas'));
const CodePreview = lazy(() => import('./components/CodePreview'));
const DeployPanel = lazy(() => import('./components/DeployPanel'));
const WalletPanel = lazy(() => import('./components/WalletPanel'));

// Example workspace definitions
const vestingExample = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'TIME_PASSED',
        id: 'trigger_1',
        x: 50,
        y: 50,
        fields: { DAYS: 90 },
        next: {
          block: {
            type: 'SEND_BCH',
            id: 'action_1',
            fields: { RECIPIENT_HASH: '' },
          },
        },
      },
    ],
  },
};

const recurringPaymentExample = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'TIME_PASSED',
        id: 'trigger_1',
        x: 50,
        y: 50,
        fields: { DAYS: 30 },
        next: {
          block: {
            type: 'SPLIT_PERCENT',
            id: 'action_1',
            fields: { PERCENT: 10 },
            next: {
              block: {
                type: 'SEND_BCH',
                id: 'action_2',
                fields: { RECIPIENT_HASH: '' },
                next: {
                  block: {
                    type: 'SEND_BACK',
                    id: 'action_3',
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
};

const tokenSplitExample = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'TOKEN_RECEIVED',
        id: 'trigger_1',
        x: 50,
        y: 50,
        fields: { CATEGORY_HEX: '' },
        next: {
          block: {
            type: 'SPLIT_PERCENT',
            id: 'action_1',
            fields: { PERCENT: 70 },
            next: {
              block: {
                type: 'SEND_TOKEN',
                id: 'action_2',
                fields: { RECIPIENT_HASH: '', CATEGORY_HEX: '' },
                next: {
                  block: {
                    type: 'SEND_TOKEN',
                    id: 'action_3',
                    fields: { RECIPIENT_HASH: '', CATEGORY_HEX: '' },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
};

const timeLockedVaultExample = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'TIME_PASSED',
        id: 'trigger_tlv',
        x: 60,
        y: 60,
        fields: { DAYS: 180 },
        next: {
          block: {
            type: 'SEND_BCH',
            id: 'action_tlv',
            fields: { RECIPIENT_HASH: '' },
          },
        },
      },
    ],
  },
};

const escrowExample = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'MULTISIG_SIGNED',
        id: 'trigger_escrow',
        x: 60,
        y: 60,
        fields: { REQUIRED: 2, TOTAL: 2 },
        next: {
          block: {
            type: 'SEND_BCH',
            id: 'action_escrow',
            fields: { RECIPIENT_HASH: '' },
          },
        },
      },
    ],
  },
};

const recurringSalaryExample = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'TIME_PASSED',
        id: 'trigger_salary',
        x: 60,
        y: 60,
        fields: { DAYS: 30 },
        next: {
          block: {
            type: 'SPLIT_PERCENT',
            id: 'action_salary_split',
            fields: { PERCENT: 90 },
            next: {
              block: {
                type: 'SEND_BACK',
                id: 'action_salary_relock',
              },
            },
          },
        },
      },
    ],
  },
};

interface ExampleOption {
  name: string;
  description: string;
  state: object;
}

const examples: ExampleOption[] = [
  { name: 'Vesting Contract', description: 'Release funds after 90 days', state: vestingExample },
  { name: 'Recurring Payment', description: '10% monthly payments', state: recurringPaymentExample },
  { name: 'Token Split', description: '70/30 token distribution', state: tokenSplitExample },
  { name: 'Time-Locked Vault', description: '180-day timelock vault', state: timeLockedVaultExample },
  { name: 'Escrow Between Two Parties', description: '2-of-2 multisig escrow', state: escrowExample },
  { name: 'Recurring Salary Payment', description: 'Split salary with auto-relock', state: recurringSalaryExample },
];

const emptyCompileResult: CompileResult = {
  source: '',
  constructorArgs: [],
};

function LoadingFallback(): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      backgroundColor: '#1a1a2e',
      color: '#00d4aa',
      fontSize: '14px'
    }}>
      Loading...
    </div>
  );
}

interface WalletInfo {
  address: string;
  cashAddress: string;
  publicKeyHex: string;
  privateKeyWif?: string;
}

interface NetworkOption {
  value: 'MAINNET' | 'TESTNET3' | 'TESTNET4' | 'CHIPNET';
  label: string;
  badge: string;
}

const NETWORK_OPTIONS: NetworkOption[] = [
  { value: 'MAINNET', label: 'Mainnet', badge: 'Mainnet (Livenet)' },
  { value: 'TESTNET3', label: 'Testnet3', badge: 'Testnet3' },
  { value: 'TESTNET4', label: 'Testnet4', badge: 'Testnet4' },
  { value: 'CHIPNET', label: 'Chipnet', badge: 'Chipnet (Default)' },
];

export default function App(): JSX.Element {
  const [compileResult, setCompileResult] = useState<CompileResult>(emptyCompileResult);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [isWikiVisible, setIsWikiVisible] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkOption>(NETWORK_OPTIONS[3]);
  const [deployments, setDeployments] = useState<StoredDeployment[]>([]);
  const [rightPanelView, setRightPanelView] = useState<'deploy' | 'interact'>('deploy');
  const loadExampleRef = useRef<((state: object) => void) | null>(null);

  useEffect(() => {
    setDeployments(loadDeployments(selectedNetwork.value));
  }, [selectedNetwork]);

  const refreshDeployments = useCallback(() => {
    setDeployments(loadDeployments(selectedNetwork.value));
  }, [selectedNetwork]);

  const handleGraphChange = useCallback((graph: BlockGraph) => {
    const result = compile(graph);
    setCompileResult(result);
  }, []);

  const handleLoadExampleReady = useCallback((loader: (state: object) => void) => {
    loadExampleRef.current = loader;
  }, []);

  const handleLoadExample = useCallback((example: ExampleOption) => {
    if (loadExampleRef.current) {
      loadExampleRef.current(example.state);
    }
  }, []);

  const handleWalletChange = useCallback((w: WalletInfo | null) => {
    setWallet(w);
  }, []);

  if (isWikiVisible) {
    return (
      <WikiPage
        content={wikiContent}
        onClose={() => setIsWikiVisible(false)}
      />
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1a1a2e',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <header
        style={{
          height: '56px',
          backgroundColor: '#16213e',
          borderBottom: '1px solid #0f3460',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#00d4aa', margin: 0 }}>
            CashBlocks
          </h1>
          <span style={{ fontSize: '12px', color: '#666', borderLeft: '1px solid #333', paddingLeft: '16px' }}>
            Visual Smart Contracts for Bitcoin Cash
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Network Badge */}
          <div style={{
            padding: '4px 12px',
            backgroundColor: '#f0b90b22',
            border: '1px solid #f0b90b',
            borderRadius: '12px',
            fontSize: '11px',
            color: '#f0b90b',
          }}>
            {selectedNetwork.badge}
          </div>

          <select
            value={selectedNetwork.value}
            onChange={(e) => {
              const option = NETWORK_OPTIONS.find((opt) => opt.value === e.target.value as NetworkOption['value']);
              setSelectedNetwork(option ?? NETWORK_OPTIONS[3]);
            }}
            style={{
              padding: '6px 12px',
              backgroundColor: '#252538',
              color: '#eaeaea',
              border: '1px solid #333',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {NETWORK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsWikiVisible(true)}
            style={{
              padding: '6px 14px',
              backgroundColor: '#252538',
              color: '#eaeaea',
              border: '1px solid #333',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            View Wiki
          </button>

          {/* Example Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '12px', color: '#888' }}>Templates:</label>
            <select
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                if (!isNaN(idx) && examples[idx]) {
                  handleLoadExample(examples[idx]);
                }
              }}
              defaultValue=""
              style={{
                padding: '6px 12px',
                backgroundColor: '#252538',
                color: '#eaeaea',
                border: '1px solid #333',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <option value="" disabled>Load template...</option>
              {examples.map((ex, idx) => (
                <option key={idx} value={idx}>{ex.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minHeight: 0,
          gap: '12px',
          // Reserve horizontal breathing room so overlay scrollbars from column one
          // never visually cover the legend column.
        }}
      >
        {/* Left Sidebar - Wallet */}
        <div
          style={{
            width: '280px',
            backgroundColor: '#0f0f1a',
            borderRight: '1px solid #333',
            overflow: 'auto',
            // Reserve gutter so the scrollbar never overlaps the adjacent legend column.
            scrollbarGutter: 'stable both-edges',
            paddingRight: '16px',
            marginRight: '6px',
            flexShrink: 0,
            padding: '12px',
          }}
        >
          <Suspense fallback={<LoadingFallback />}>
            <WalletPanel
              network={selectedNetwork.value}
              networkLabel={selectedNetwork.label}
              onWalletChange={handleWalletChange}
            />
          </Suspense>

          {/* Quick Stats */}
          <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#16213e', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>CONTRACT STATUS</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#888' }}>Blocks:</span>
              <span style={{ color: compileResult.source ? '#00d4aa' : '#666' }}>
                {compileResult.source ? 'Valid' : 'Empty'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
              <span style={{ color: '#888' }}>Args:</span>
              <span style={{ color: '#aaa' }}>{compileResult.constructorArgs.length}</span>
            </div>
            {compileResult.error && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#ff6b6b' }}>
                Error: {compileResult.error.slice(0, 50)}...
              </div>
            )}
          </div>
        </div>

        {/* Center - Block Canvas */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Suspense fallback={<LoadingFallback />}>
              <BlockCanvas
                onChange={handleGraphChange}
                onLoadExample={handleLoadExampleReady}
              />
            </Suspense>
          </div>
        </div>

        {/* Right Panel - Code + Deploy */}
        <div
          style={{
            width: '380px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderLeft: '1px solid #333',
            flexShrink: 0,
          }}
        >
          {/* Code Preview (60%) */}
          <div style={{ flex: '0 0 55%', borderBottom: '1px solid #333', overflow: 'hidden' }}>
            <Suspense fallback={<LoadingFallback />}>
              <CodePreview compileResult={compileResult} />
            </Suspense>
          </div>

          {/* Deploy / Interact Panel (40%) */}
          <div style={{ flex: '0 0 45%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
              {(['deploy', 'interact'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setRightPanelView(view)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: rightPanelView === view ? '#252538' : 'transparent',
                    color: '#eaeaea',
                    border: 'none',
                    borderBottom: rightPanelView === view ? '2px solid #00d4aa' : 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {view === 'deploy' ? 'Deploy' : 'Interact'}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Suspense fallback={<LoadingFallback />}>
                {rightPanelView === 'deploy' ? (
                  <DeployPanel
                    compileResult={compileResult}
                    wallet={wallet}
                    network={selectedNetwork.value}
                    networkLabel={selectedNetwork.label}
                    onDeploySuccess={refreshDeployments}
                  />
                ) : (
                  <InteractionsPanel
                    deployments={deployments}
                    network={selectedNetwork.value}
                    networkLabel={selectedNetwork.label}
                    wallet={wallet}
                  />
                )}
              </Suspense>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          height: '28px',
          backgroundColor: '#0f0f1a',
          borderTop: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          fontSize: '10px',
          color: '#555',
        }}
      >
        <span>CashBlocks v1.0 - BCH Hackathon 2026</span>
        <span>Network: Chipnet | Built with CashScript ^0.10.0</span>
      </footer>

    </div>
  );
}
