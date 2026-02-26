import { useMemo, useState, useEffect, useCallback } from 'react';
import type { StoredDeployment } from '../services/deployments';
import type { ConstructorArg } from '../types';
import { interactWithContract } from '../services/interaction';
import { hashToCashAddress, normalizeRecipientHash } from '../compiler/address';

async function fetchContractUtxos(address: string, network: string): Promise<{ txid: string; vout: number; satoshis: string }[]> {
  const res = await fetch(`/api/utxos?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}`);
  const data = await res.json() as { utxos?: { txid: string; vout: number; satoshis: string }[]; error?: string };
  if (data.error) throw new Error(data.error);
  return data.utxos ?? [];
}

interface WalletInfo {
  address: string;
  cashAddress: string;
  publicKeyHex: string;
  privateKeyWif?: string;
}

interface InteractionsPanelProps {
  deployments: StoredDeployment[];
  network: string;
  networkLabel: string;
  wallet?: WalletInfo | null;
}

interface TextArgState {
  [name: string]: string;
}

interface EditableUtxo {
  txid: string;
  vout: string;
  satoshis: string;
}

interface EditableOutput {
  to: string;
  amount: string;
}

export default function InteractionsPanel({ deployments, network, networkLabel, wallet }: InteractionsPanelProps): JSX.Element {
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string>('');
  const [argValues, setArgValues] = useState<TextArgState>({});
  const [utxos, setUtxos] = useState<EditableUtxo[]>([{ txid: '', vout: '0', satoshis: '' }]);
  const [outputs, setOutputs] = useState<EditableOutput[]>([{ to: '', amount: '' }]);
  const [fee, setFee] = useState<string>('1000');
  const [fetchingUtxos, setFetchingUtxos] = useState<boolean>(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'busy' | 'error' | 'success'; message?: string }>({ type: 'idle' });
  const [useWalletSigner, setUseWalletSigner] = useState<boolean>(true);
  const [customSigner, setCustomSigner] = useState<string>('');

  useEffect(() => {
    setSelectedDeploymentId(deployments[0]?.id ?? null);
  }, [deployments]);

  const selectedDeployment = useMemo(() => deployments.find((d) => d.id === selectedDeploymentId) ?? null, [deployments, selectedDeploymentId]);

  const functionOptions = selectedDeployment?.artifact?.abi ?? [];

  useEffect(() => {
    if (functionOptions.length > 0) {
      setSelectedFunction(functionOptions[0].name);
      const defaults: TextArgState = {};
      functionOptions[0].inputs?.forEach((input: { name: string; type: string }) => {
        if (input.type === 'pubkey' && wallet?.publicKeyHex) {
          defaults[input.name] = wallet.publicKeyHex;
        } else {
          defaults[input.name] = '';
        }
      });
      setArgValues(defaults);
    } else {
      setSelectedFunction('');
      setArgValues({});
    }
  }, [selectedDeployment, wallet?.publicKeyHex]);

  const currentFunction = useMemo(() => functionOptions.find((fn) => fn.name === selectedFunction) ?? null, [functionOptions, selectedFunction]);

  const handleArgChange = useCallback((name: string, value: string) => {
    setArgValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleUtxoChange = (index: number, field: keyof EditableUtxo, value: string) => {
    setUtxos((prev) => prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)));
  };

  const handleOutputChange = (index: number, field: keyof EditableOutput, value: string) => {
    setOutputs((prev) => prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)));
  };

  const addUtxo = () => setUtxos((prev) => [...prev, { txid: '', vout: '0', satoshis: '' }]);
  const removeUtxo = (index: number) => setUtxos((prev) => prev.filter((_, idx) => idx !== index));

  const addOutput = () => setOutputs((prev) => [...prev, { to: '', amount: '' }]);
  const removeOutput = (index: number) => setOutputs((prev) => prev.filter((_, idx) => idx !== index));

  const handleFetchUtxos = useCallback(async () => {
    if (!selectedDeployment) return;
    setFetchingUtxos(true);
    try {
      const fetched = await fetchContractUtxos(selectedDeployment.address, network);
      if (fetched.length === 0) {
        setStatus({ type: 'error', message: 'No UTXOs found for this contract. Fund it first.' });
      } else {
        setUtxos(fetched.map((u) => ({ txid: u.txid, vout: String(u.vout), satoshis: u.satoshis })));
        // Auto-fill outputs from what the contract enforces at the script level.
        //
        // Detection uses the stored artifact source:
        //   - `recipientHash` constructor arg → P2PKH SEND_BCH output
        //   - `activeBytecode` in source     → SEND_BACK output (contract self-send)
        //   - SPLIT_PERCENT pattern          → two outputs; percent extracted from source
        //   - Neither                        → TIME_LOCK_OUTPUT / unknown; wallet fallback
        const totalSats = fetched.reduce((sum, u) => sum + Number(u.satoshis), 0);
        const feeNum = Number(fee) || 800;
        const spendable = Math.max(0, totalSats - feeNum);

        const source = selectedDeployment.artifact.source ?? '';
        const hasSendBack = source.includes('activeBytecode');

        // Case 1: recipient stored as a constructor arg (value was not inlined)
        const recipientArg = selectedDeployment.constructorArgs.find(
          (a) => a.name === 'recipientHash'
        );
        let recipientAddress: string | null = null;
        if (recipientArg?.value) {
          const normalized = normalizeRecipientHash(String(recipientArg.value));
          if (normalized.hex) {
            recipientAddress = hashToCashAddress(normalized.hex, network);
          }
        }
        // Case 2: recipient was inlined in the source as a hex literal, e.g.
        // new LockingBytecodeP2PKH(0xf28d8cee...) — constructorArgs will be []
        if (!recipientAddress) {
          const hashLiteralMatch = source.match(
            /new LockingBytecodeP2PKH\(0x([0-9a-fA-F]{40})\)/
          );
          if (hashLiteralMatch) {
            recipientAddress = hashToCashAddress(hashLiteralMatch[1], network);
          }
        }

        if (recipientAddress && hasSendBack) {
          // SPLIT_PERCENT + SEND_BCH + SEND_BACK: two outputs
          // Extract split percent from source (e.g. "totalValue * 10 / 100")
          const percentMatch = source.match(/totalValue \* (\d+) \/ 100/);
          const percent = percentMatch ? Number(percentMatch[1]) : 50;
          const out0 = Math.max(546, Math.floor(spendable * percent / 100));
          const out1 = Math.max(546, spendable - out0);
          setOutputs([
            { to: recipientAddress, amount: String(out0) },
            { to: selectedDeployment.address, amount: String(out1) },
          ]);
        } else if (recipientAddress) {
          // SEND_BCH only: one output to the baked-in recipient
          setOutputs([{ to: recipientAddress, amount: String(Math.max(546, spendable)) }]);
        } else if (hasSendBack) {
          // SEND_BACK only (Name Registry, Counter): output back to the contract itself
          setOutputs([{ to: selectedDeployment.address, amount: String(Math.max(546, spendable)) }]);
        } else {
          // TIME_LOCK_OUTPUT or unknown: fall back to connected wallet
          setOutputs([{ to: wallet?.cashAddress ?? '', amount: String(Math.max(546, spendable)) }]);
        }
        setStatus({ type: 'idle' });
      }
    } catch (err) {
      const error = err as Error;
      setStatus({ type: 'error', message: `Fetch failed: ${error.message}` });
    } finally {
      setFetchingUtxos(false);
    }
  }, [selectedDeployment, network, wallet, fee]);

  const handleInteract = async () => {
    if (!selectedDeployment) return;
    if (!currentFunction) {
      setStatus({ type: 'error', message: 'Select a contract function' });
      return;
    }

    const cleanedUtxos = utxos.filter((u) => u.txid && u.satoshis);
    const cleanedOutputs = outputs.filter((o) => o.to && o.amount);

    if (cleanedUtxos.length === 0 || cleanedOutputs.length === 0) {
      setStatus({ type: 'error', message: 'Provide at least one UTXO and one output' });
      return;
    }

    const functionArgs: ConstructorArg[] = (currentFunction.inputs || []).map((input: { name: string; type: string }) => ({
      name: input.name,
      type: input.type as ConstructorArg['type'],
      value: argValues[input.name] || '',
    }));

    const signerWif = useWalletSigner ? wallet?.privateKeyWif : customSigner || undefined;

    setStatus({ type: 'busy', message: 'Broadcasting transaction...' });

    try {
      const result = await interactWithContract({
        artifact: selectedDeployment.artifact,
        constructorArgs: selectedDeployment.constructorArgs,
        functionName: selectedFunction,
        functionArgs,
        utxos: cleanedUtxos.map((u) => ({ txid: u.txid, vout: Number(u.vout || 0), satoshis: u.satoshis })),
        outputs: cleanedOutputs,
        fee,
        network,
        signerWif,
      });
      setStatus({ type: 'success', message: `Interaction sent. TXID: ${result.txid}` });
    } catch (error) {
      const err = error as Error;
      setStatus({ type: 'error', message: err.message });
    }
  };

  if (!selectedDeployment) {
    return (
      <div style={{ color: '#aaa', fontSize: '13px' }}>
        No deployments recorded for {networkLabel}. Deploy a contract first to enable interactions.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: '#eaeaea' }}>
      <div>
        <label style={{ fontSize: '12px', color: '#888' }}>Deployment</label>
        <select
          value={selectedDeploymentId ?? ''}
          onChange={(e) => setSelectedDeploymentId(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#eaeaea',
            marginTop: '4px',
          }}
        >
          {deployments.map((deployment) => (
            <option key={deployment.id} value={deployment.id}>
              {deployment.address} · {new Date(deployment.createdAt).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#252538', padding: '12px', borderRadius: '6px' }}>
        <div style={{ fontSize: '12px', color: '#888' }}>Contract Address</div>
        <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedDeployment.address}</div>
        <div style={{ fontSize: '12px', color: '#888' }}>Network</div>
        <div>{networkLabel}</div>
      </div>

      <div>
        <label style={{ fontSize: '12px', color: '#888' }}>Function</label>
        <select
          value={selectedFunction}
          onChange={(e) => {
            setSelectedFunction(e.target.value);
            const fn = functionOptions.find((f) => f.name === e.target.value);
            const defaults: TextArgState = {};
            fn?.inputs?.forEach((input: { name: string; type: string }) => {
              if (input.type === 'pubkey' && wallet?.publicKeyHex) {
                defaults[input.name] = wallet.publicKeyHex;
              } else {
                defaults[input.name] = '';
              }
            });
            setArgValues(defaults);
          }}
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#eaeaea',
            marginTop: '4px',
          }}
        >
          {functionOptions.map((fn) => (
            <option key={fn.name} value={fn.name}>{fn.name}</option>
          ))}
        </select>
      </div>

      {currentFunction?.inputs?.length ? (
        <div style={{ backgroundColor: '#252538', padding: '12px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>Function Arguments</div>
          {currentFunction.inputs.map((input: { name: string; type: string }) => {
            if (input.type === 'sig') {
              return (
                <div key={input.name} style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#555' }}>
                    <span style={{ color: '#666' }}>{input.name}</span> (sig) —{' '}
                    <span style={{ color: '#00d4aa88' }}>auto-signed by wallet</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={input.name} style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
                  {input.name} <span style={{ color: '#666' }}>({input.type})</span>
                </label>
                <input
                  type="text"
                  value={argValues[input.name] || ''}
                  onChange={(e) => handleArgChange(input.name, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    color: '#eaeaea',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      <section style={{ backgroundColor: '#252538', padding: '12px', borderRadius: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: '#888' }}>Contract UTXOs</div>
          <button
            type="button"
            onClick={handleFetchUtxos}
            disabled={fetchingUtxos || !selectedDeployment}
            style={{
              padding: '4px 10px',
              backgroundColor: fetchingUtxos ? '#333' : '#00d4aa22',
              border: '1px solid #00d4aa55',
              borderRadius: '4px',
              color: fetchingUtxos ? '#666' : '#00d4aa',
              fontSize: '11px',
              cursor: fetchingUtxos ? 'not-allowed' : 'pointer',
            }}
          >
            {fetchingUtxos ? 'Fetching...' : '⟳ Fetch from chain'}
          </button>
        </div>
        {utxos.map((utxo, index) => (
          <div key={index} style={{ display: 'flex', flexDirection: 'column', marginBottom: '8px', gap: '4px' }}>
            <input
              type="text"
              placeholder="TXID"
              value={utxo.txid}
              onChange={(e) => handleUtxoChange(index, 'txid', e.target.value)}
              style={{ padding: '8px', backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#eaeaea', fontFamily: 'monospace' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                placeholder="Vout"
                value={utxo.vout}
                onChange={(e) => handleUtxoChange(index, 'vout', e.target.value)}
                style={{ flex: 1, padding: '8px', backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#eaeaea' }}
              />
              <input
                type="number"
                placeholder="Satoshis"
                value={utxo.satoshis}
                onChange={(e) => handleUtxoChange(index, 'satoshis', e.target.value)}
                style={{ flex: 2, padding: '8px', backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#eaeaea' }}
              />
            </div>
            {utxos.length > 1 && (
              <button
                type="button"
                onClick={() => removeUtxo(index)}
                style={{ alignSelf: 'flex-end', border: 'none', background: 'transparent', color: '#f48771', cursor: 'pointer', fontSize: '11px' }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addUtxo} style={{ border: '1px dashed #444', background: 'transparent', color: '#eaeaea', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
          + Add UTXO
        </button>
      </section>

      <section style={{ backgroundColor: '#252538', padding: '12px', borderRadius: '6px' }}>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>Transaction Outputs</div>
        {outputs.map((output, index) => (
          <div key={index} style={{ display: 'flex', flexDirection: 'column', marginBottom: '8px', gap: '4px' }}>
            <input
              type="text"
              placeholder="Recipient address"
              value={output.to}
              onChange={(e) => handleOutputChange(index, 'to', e.target.value)}
              style={{ padding: '8px', backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#eaeaea', fontFamily: 'monospace' }}
            />
            <input
              type="number"
              placeholder="Amount (satoshis)"
              value={output.amount}
              onChange={(e) => handleOutputChange(index, 'amount', e.target.value)}
              style={{ padding: '8px', backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#eaeaea' }}
            />
            {outputs.length > 1 && (
              <button
                type="button"
                onClick={() => removeOutput(index)}
                style={{ alignSelf: 'flex-end', border: 'none', background: 'transparent', color: '#f48771', cursor: 'pointer', fontSize: '11px' }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addOutput} style={{ border: '1px dashed #444', background: 'transparent', color: '#eaeaea', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
          + Add Output
        </button>
      </section>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '12px', color: '#888', display: 'block', marginBottom: '4px' }}>Miner Fee (sats)</label>
          <input
            type="number"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            style={{ width: '100%', padding: '8px', backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#eaeaea' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '12px', color: '#888', display: 'block', marginBottom: '4px' }}>
            Signer
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px' }}>
              <input
                type="radio"
                checked={useWalletSigner}
                onChange={() => setUseWalletSigner(true)}
                disabled={!wallet?.privateKeyWif}
                style={{ marginRight: '6px' }}
              />
              Use wallet private key
            </label>
            <label style={{ fontSize: '11px' }}>
              <input
                type="radio"
                checked={!useWalletSigner}
                onChange={() => setUseWalletSigner(false)}
                style={{ marginRight: '6px' }}
              />
              Provide custom WIF
            </label>
            {!useWalletSigner && (
              <input
                type="password"
                value={customSigner}
                onChange={(e) => setCustomSigner(e.target.value)}
                placeholder="WIF"
                style={{ padding: '8px', backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#eaeaea' }}
              />
            )}
          </div>
        </div>
      </div>

      {status.type !== 'idle' && (
        <div style={{ fontSize: '12px', color: status.type === 'error' ? '#f48771' : '#7dd3a0' }}>
          {status.message}
        </div>
      )}

      <button
        onClick={handleInteract}
        style={{
          padding: '12px',
          backgroundColor: '#00d4aa',
          color: '#1a1a2e',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 'bold',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        Send Interaction
      </button>
    </div>
  );
}
