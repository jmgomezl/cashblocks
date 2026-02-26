import { useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { CompileResult, CashScriptArtifact, DeployedContract, ConstructorArg } from '../types';
import { compileSource } from '../services/compile';
import { deployContract, fundContractAddress } from '../services/network';
import { createDeploymentRecord, saveDeployment } from '../services/deployments';

interface WalletInfo {
  address: string;
  cashAddress: string;
  publicKeyHex: string;
  privateKeyWif?: string;
}

interface DeployPanelProps {
  compileResult: CompileResult;
  wallet?: WalletInfo | null;
  network: string;
  networkLabel: string;
  onDeploySuccess?: () => void;
}

type DeployState = 'idle' | 'compiling' | 'deploying' | 'funding' | 'deployed' | 'error';

export default function DeployPanel({ compileResult, wallet, network, networkLabel, onDeploySuccess }: DeployPanelProps): JSX.Element {
  const [deployState, setDeployState] = useState<DeployState>('idle');
  const [deployedContract, setDeployedContract] = useState<DeployedContract | null>(null);
  const [fundingTxid, setFundingTxid] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [constructorValues, setConstructorValues] = useState<Record<string, string>>({});
  const [fundAmount, setFundAmount] = useState<string>('10000');

  const hasValidContract = !compileResult.error && compileResult.source.length > 0;
  const hasWallet = wallet !== null;
  const canDeploy = hasValidContract && hasWallet;

  const handleArgChange = useCallback((name: string, value: string) => {
    setConstructorValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleDeploy = useCallback(async () => {
    if (!canDeploy) return;

    setDeployState('compiling');
    setErrorMessage('');

    try {
      // Compile the CashScript source
      const compileResponse = await compileSource(compileResult.source);

      if (compileResponse.error || !compileResponse.artifact) {
        setDeployState('error');
        setErrorMessage(compileResponse.error || 'Compilation failed');
        return;
      }

      setDeployState('deploying');

      // Merge constructor args with user-provided values
      const argsWithValues: ConstructorArg[] = compileResult.constructorArgs.map((arg) => {
        let value = constructorValues[arg.name];

        // Auto-fill known args when blank
        if (!value && arg.name === 'recipientHash' && wallet) {
          value = wallet.address;
        }
        if (!value && arg.name === 'unlockTime') {
          const offset = arg.timeOffsetSeconds ?? 90 * 86400;
          value = String(Math.floor(Date.now() / 1000) + offset);
        }

        // Convert value to appropriate type
        if (arg.type === 'int' && value) {
          return { ...arg, value: BigInt(value) };
        }

        return { ...arg, value: value || arg.value };
      });

      // Deploy to desired network
      const deployed = await deployContract(
        compileResponse.artifact as CashScriptArtifact,
        argsWithValues,
        network
      );

      // Fund the contract if wallet has a private key and amount > 0
      let txid = '';
      const parsedAmount = BigInt(fundAmount || '0');
      if (wallet?.privateKeyWif && parsedAmount > 0n) {
        setDeployState('funding');
        const fundResult = await fundContractAddress(
          deployed.address,
          wallet.privateKeyWif,
          wallet.cashAddress,
          parsedAmount,
          network,
        );
        txid = fundResult.txid;
        setFundingTxid(txid);
      }

      const record = createDeploymentRecord({
        address: deployed.address,
        network,
        artifact: compileResponse.artifact as CashScriptArtifact,
        constructorArgs: argsWithValues,
      });
      saveDeployment(record);
      onDeploySuccess?.();
      setDeployedContract(deployed);
      setDeployState('deployed');
    } catch (err) {
      const error = err as Error;
      setDeployState('error');
      setErrorMessage(error.message);
    }
  }, [canDeploy, compileResult.source, compileResult.constructorArgs, constructorValues, wallet, network]);

  const handleReset = useCallback(() => {
    setDeployState('idle');
    setDeployedContract(null);
    setFundingTxid('');
    setErrorMessage('');
  }, []);

  const formatArgType = (type: string): string => {
    switch (type) {
      case 'bytes20':
        return 'Address Hash (40 hex chars)';
      case 'int':
        return 'Integer';
      case 'bytes':
        return 'Bytes (hex)';
      case 'pubkey':
        return 'Public Key (66 hex chars)';
      default:
        return type;
    }
  };

  const getArgPlaceholder = (arg: ConstructorArg): string => {
    if (arg.name === 'unlockTime') {
      const offset = arg.timeOffsetSeconds ?? 90 * 86400;
      const targetTs = Math.floor(Date.now() / 1000) + offset;
      const targetDate = new Date(targetTs * 1000).toLocaleString();
      return `Unix timestamp — unlocks: ${targetDate}`;
    }
    if (arg.name === 'recipientHash' && wallet) {
      return `Default: ${wallet.address.slice(0, 20)}...`;
    }
    return `Enter ${arg.type}`;
  };

  const getArgDefault = (arg: ConstructorArg): string => {
    if (arg.name === 'unlockTime' && !constructorValues[arg.name]) {
      const offset = arg.timeOffsetSeconds ?? 90 * 86400;
      return String(Math.floor(Date.now() / 1000) + offset);
    }
    return constructorValues[arg.name] || '';
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '12px',
        backgroundColor: '#1a1a2e',
        color: '#eaeaea',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#00d4aa',
          borderBottom: '1px solid #333',
          paddingBottom: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Deploy to {networkLabel}</span>
        {!hasWallet && (
          <span style={{ color: '#f0b90b', fontSize: '10px', fontWeight: 'normal' }}>
            Create wallet first
          </span>
        )}
      </div>

      {/* Constructor Args Input */}
      {compileResult.constructorArgs.length > 0 && deployState === 'idle' && (
        <div
          style={{
            backgroundColor: '#252538',
            padding: '12px',
            borderRadius: '4px',
            fontSize: '11px',
          }}
        >
          <div style={{ color: '#888', marginBottom: '10px', fontWeight: 'bold' }}>
            Constructor Arguments:
          </div>
          {compileResult.constructorArgs.map((arg) => (
            <div key={arg.name} style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>
                {arg.name} <span style={{ color: '#666' }}>({formatArgType(arg.type)})</span>
              </label>
              <input
                type="text"
                value={getArgDefault(arg)}
                onChange={(e) => handleArgChange(arg.name, e.target.value)}
                placeholder={getArgPlaceholder(arg)}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#1a1a2e',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  color: '#eaeaea',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Fund Amount Input */}
      {deployState === 'idle' && canDeploy && (
        <div style={{ fontSize: '11px' }}>
          <label style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
            Fund amount (satoshis) — sent from your wallet to the contract
          </label>
          <input
            type="number"
            min="546"
            value={fundAmount}
            onChange={(e) => setFundAmount(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#252538',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#eaeaea',
              fontSize: '11px',
            }}
          />
          <div style={{ color: '#555', marginTop: '3px', fontSize: '10px' }}>
            ≈ {Number(fundAmount || 0) / 1e8} BCH · fee ~1000 sat
          </div>
        </div>
      )}

      {/* Status */}
      <div style={{ fontSize: '11px', color: '#888' }}>
        {deployState === 'idle' && (
          !hasValidContract
            ? 'Add blocks to create a valid contract'
            : !hasWallet
              ? 'Create a wallet first to deploy'
              : 'Ready to deploy'
        )}
        {deployState === 'compiling' && 'Compiling CashScript...'}
        {deployState === 'deploying' && `Deploying to ${networkLabel}...`}
        {deployState === 'funding' && 'Sending funds to contract...'}
        {deployState === 'deployed' && 'Contract deployed and funded!'}
        {deployState === 'error' && (
          <span style={{ color: '#f48771' }}>Error: {errorMessage}</span>
        )}
      </div>

      {/* Deploy Button */}
      {(deployState === 'idle' || deployState === 'error') && (
        <button
          onClick={handleDeploy}
          disabled={!canDeploy}
          style={{
            padding: '12px',
            backgroundColor: canDeploy ? '#00d4aa' : '#333',
            color: canDeploy ? '#1a1a2e' : '#666',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: canDeploy ? 'pointer' : 'not-allowed',
          }}
        >
          Deploy Contract
        </button>
      )}

      {/* Loading State */}
      {(deployState === 'compiling' || deployState === 'deploying') && (
        <div style={{ padding: '16px', textAlign: 'center', color: '#00d4aa' }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>...</div>
          <div style={{ fontSize: '12px' }}>
            {deployState === 'compiling' ? 'Compiling...' : 'Deploying...'}
          </div>
        </div>
      )}

      {/* Deployed Contract Info */}
      {deployState === 'deployed' && deployedContract && (
        <div
          style={{
            backgroundColor: '#252538',
            padding: '16px',
            borderRadius: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <div style={{ color: '#00d4aa', fontWeight: 'bold' }}>
            {fundingTxid ? 'Contract Deployed & Funded!' : 'Contract Deployed!'}
          </div>

          {/* QR Code */}
          <div style={{ backgroundColor: 'white', padding: '8px', borderRadius: '4px' }}>
            <QRCodeSVG value={deployedContract.address} size={100} />
          </div>

          {/* Address */}
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
              Contract Address
            </div>
            <div
              style={{
                fontSize: '9px',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                color: '#00d4aa',
                backgroundColor: '#1a1a2e',
                padding: '8px',
                borderRadius: '4px',
              }}
            >
              {deployedContract.address}
            </div>
          </div>

          {/* Funding Tx */}
          {fundingTxid && (
            <div style={{ textAlign: 'center', width: '100%' }}>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                Funding Transaction
              </div>
              <div
                style={{
                  fontSize: '9px',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  color: '#f0b90b',
                  backgroundColor: '#1a1a2e',
                  padding: '8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={() => navigator.clipboard.writeText(fundingTxid)}
                title="Click to copy"
              >
                {fundingTxid}
              </div>
              <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
                Click txid to copy · {Number(fundAmount) / 1e8} BCH sent to contract
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <button
              onClick={() => navigator.clipboard.writeText(deployedContract.address)}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#333',
                color: '#eee',
                border: 'none',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Copy Address
            </button>
            <button
              onClick={handleReset}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: 'transparent',
                color: '#888',
                border: '1px solid #444',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              New Deploy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
