import { decodeCashAddress, encodeCashAddress, CashAddressType } from '@bitauth/libauth';

// Convert a bytes20 hex hash to a P2PKH cashaddress for the given network
export function hashToCashAddress(hashHex: string, network: string): string | null {
  try {
    const clean = hashHex.replace(/^0x/, '').toLowerCase();
    if (clean.length !== 40) return null;
    const payload = Uint8Array.from(
      clean.match(/.{2}/g)!.map((b) => parseInt(b, 16))
    );
    const prefix = network === 'MAINNET' ? 'bitcoincash' : 'bchtest';
    const result = encodeCashAddress({ prefix, type: CashAddressType.p2pkh, payload });
    return typeof result === 'string' ? result : null;
  } catch {
    return null;
  }
}

interface NormalizeResult {
  hex?: string;
  error?: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeRecipientHash(value?: string): NormalizeResult {
  if (!value) {
    return { hex: undefined };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { hex: undefined };
  }

  const hexMatch = trimmed.match(/^0x?([0-9a-fA-F]{40})$/);
  if (hexMatch) {
    return { hex: hexMatch[1].toLowerCase() };
  }

  const candidate = trimmed.includes(':') ? trimmed : `bchtest:${trimmed}`;
  const decoded = decodeCashAddress(candidate);

  if (typeof decoded === 'string') {
    return { error: `Invalid CashAddress: ${decoded}` };
  }

  if (decoded.type !== CashAddressType.p2pkh) {
    return { error: 'Recipient CashAddress must be a P2PKH address' };
  }

  if (decoded.payload.length !== 20) {
    return { error: 'Recipient hash must be 20 bytes (hash160) for P2PKH outputs' };
  }

  return { hex: bytesToHex(decoded.payload) };
}
