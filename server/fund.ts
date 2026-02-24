import { TransactionBuilder, SignatureTemplate, Network } from 'cashscript';
import { decodePrivateKeyWif } from '@bitauth/libauth';
import { getProvider } from './deploy.js';

export interface FundRequest {
  contractAddress: string;
  walletWif: string;
  walletCashAddress: string;
  amountSats: string;
}

export interface FundResponse {
  txid?: string;
  error?: string;
}

const FEE = 1000n; // fixed miner fee in satoshis

export function validateFundRequest(body: unknown): FundRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const req = body as Record<string, unknown>;
  if (typeof req.contractAddress !== 'string' || !req.contractAddress) return null;
  if (typeof req.walletWif !== 'string' || !req.walletWif) return null;
  if (typeof req.walletCashAddress !== 'string' || !req.walletCashAddress) return null;
  if (typeof req.amountSats !== 'string' || !req.amountSats) return null;
  return req as unknown as FundRequest;
}

export async function fundContract(
  request: FundRequest,
  network: Network,
): Promise<FundResponse> {
  try {
    const provider = getProvider(network);
    const amountSats = BigInt(request.amountSats);

    // Decode private key from WIF
    const decoded = decodePrivateKeyWif(request.walletWif);
    if (typeof decoded === 'string') {
      throw new Error('Invalid WIF: ' + decoded);
    }

    // Fetch wallet UTXOs
    const utxos = await provider.getUtxos(request.walletCashAddress);
    if (utxos.length === 0) {
      throw new Error('Wallet has no UTXOs — fund it from the faucet first');
    }

    const totalSats = utxos.reduce((sum, u) => sum + u.satoshis, 0n);
    const changeSats = totalSats - amountSats - FEE;
    if (changeSats < 0n) {
      throw new Error(
        `Insufficient balance: have ${totalSats} sats, need ${amountSats + FEE} (${amountSats} + ${FEE} fee)`,
      );
    }

    // Build the transaction: P2PKH inputs → P2SH32 contract output + change
    const sigTemplate = new SignatureTemplate(decoded.privateKey);
    const txBuilder = new TransactionBuilder({ provider });

    for (const utxo of utxos) {
      txBuilder.addInput(utxo, sigTemplate.unlockP2PKH());
    }

    txBuilder.addOutput({ to: request.contractAddress, amount: amountSats });

    // Return change to wallet (dust threshold: 546 sats)
    if (changeSats >= 546n) {
      txBuilder.addOutput({ to: request.walletCashAddress, amount: changeSats });
    }

    const details = await txBuilder.send();
    const txid = typeof details === 'string' ? details : details.txid;
    return { txid };
  } catch (err) {
    const error = err as Error;
    return { error: `Funding error: ${error.message}` };
  }
}
