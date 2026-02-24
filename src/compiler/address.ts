import { decodeCashAddress, CashAddressType } from '@bitauth/libauth';

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
