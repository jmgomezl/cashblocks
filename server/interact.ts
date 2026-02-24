import { Contract, SignatureTemplate, Network } from 'cashscript';
import type { Artifact } from 'cashscript';
import type { ConstructorArg } from './deploy.js';
import { getProvider } from './deploy.js';

interface FunctionArg extends ConstructorArg {
  signer?: 'wallet' | 'manual';
}

interface UtxoInput {
  txid: string;
  vout: number;
  satoshis: string | number | bigint;
}

interface OutputInput {
  to: string;
  amount: string | number | bigint;
}

export interface InteractionRequest {
  artifact: Artifact;
  constructorArgs: ConstructorArg[];
  functionName: string;
  functionArgs: FunctionArg[];
  utxos: UtxoInput[];
  outputs: OutputInput[];
  fee?: string | number;
  signerWif?: string;
}

export function validateInteractionRequest(body: unknown): InteractionRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const req = body as Record<string, unknown>;
  if (!req.artifact || typeof req.artifact !== 'object') return null;
  if (!Array.isArray(req.constructorArgs)) return null;
  if (typeof req.functionName !== 'string' || req.functionName.length === 0) return null;
  if (!Array.isArray(req.functionArgs)) return null;
  if (!Array.isArray(req.utxos) || req.utxos.length === 0) return null;
  if (!Array.isArray(req.outputs) || req.outputs.length === 0) return null;
  return req as unknown as InteractionRequest;
}

function mapArgs(args: ConstructorArg[]): unknown[] {
  return args.map((arg) => {
    if (arg.type === 'int') {
      return typeof arg.value === 'bigint' ? arg.value : BigInt(arg.value ?? 0);
    }
    return arg.value;
  });
}

function mapFunctionArgs(args: FunctionArg[], signerWif?: string): unknown[] {
  return args.map((arg) => {
    if (arg.type === 'int') {
      return typeof arg.value === 'bigint' ? arg.value : BigInt(arg.value ?? 0);
    }
    if (arg.type === 'sig' && arg.value === 'wallet') {
      if (!signerWif) {
        throw new Error('Signer WIF required for signature arguments');
      }
      return new SignatureTemplate(signerWif);
    }
    return arg.value;
  });
}

export async function interactWithContract(
  request: InteractionRequest,
  network: Network,
): Promise<{ txid?: string; error?: string }> {
  try {
    const provider = getProvider(network);
    const contract = new Contract(request.artifact, mapArgs(request.constructorArgs), { provider });

    const contractFunction = (contract.functions as Record<string, (...args: unknown[]) => any>)[request.functionName];
    if (!contractFunction) {
      return { error: `Function ${request.functionName} not found in contract ABI` };
    }

    const tx = contractFunction(...mapFunctionArgs(request.functionArgs, request.signerWif));

    request.utxos.forEach((utxo) => {
      tx.from({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: typeof utxo.satoshis === 'bigint'
          ? utxo.satoshis
          : BigInt(utxo.satoshis),
      });
    });

    if (request.fee) {
      tx.withHardcodedFee(BigInt(request.fee));
    }

    request.outputs.forEach((output) => {
      tx.to(output.to, typeof output.amount === 'bigint' ? output.amount : BigInt(output.amount));
    });

    const details = await tx.send();
    const txid = typeof details === 'string' ? details : details.txid;
    return { txid };
  } catch (err) {
    const error = err as Error;
    return { error: error.message };
  }
}
