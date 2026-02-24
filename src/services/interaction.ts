import type { CashScriptArtifact, ConstructorArg } from '../types';

export interface InteractionUtxo {
  txid: string;
  vout: number;
  satoshis: string;
}

export interface InteractionOutput {
  to: string;
  amount: string;
}

export interface InteractionRequest {
  artifact: CashScriptArtifact;
  constructorArgs: ConstructorArg[];
  functionName: string;
  functionArgs: ConstructorArg[];
  utxos: InteractionUtxo[];
  outputs: InteractionOutput[];
  fee?: string;
  network: string;
  signerWif?: string;
}

export async function interactWithContract(request: InteractionRequest): Promise<{ txid?: string; error?: string }> {
  const response = await fetch('/api/contract/interact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = await response.json() as { txid?: string; error?: string };
  if (!response.ok || data.error) {
    throw new Error(data.error || 'Interaction failed');
  }
  return data;
}
