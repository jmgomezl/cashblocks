import {
  binToHex,
  hexToBin,
  utf8ToBin,
  sha256,
  hash256,
  secp256k1,
} from '@bitauth/libauth';

const DOMAIN_TAG_BYTES = utf8ToBin('BCH1_ORACLE_V1');
const FEED_ID_BYTES = 32;
const INT_BYTE_LENGTH = 8;

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function encodeBigIntLE(value: bigint, length: number): Uint8Array {
  if (value < 0n) {
    throw new Error('Only unsigned integers are supported');
  }
  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) {
    throw new Error(`Value ${value} does not fit in ${length} bytes`);
  }
  return bytes;
}

function parseFeedId(feedId: string): Uint8Array {
  const normalized = stripHexPrefix(feedId.toLowerCase());
  if (normalized.length !== FEED_ID_BYTES * 2) {
    throw new Error('feedId must be 32 bytes of hex');
  }
  return hexToBin(normalized);
}

export interface OracleMessageParams {
  feedId: string;
  price: bigint;
  timestamp: bigint;
}

export function buildOracleMessage({ feedId, price, timestamp }: OracleMessageParams): Uint8Array {
  const feedBytes = parseFeedId(feedId);
  const priceBytes = encodeBigIntLE(price, INT_BYTE_LENGTH);
  const timeBytes = encodeBigIntLE(timestamp, INT_BYTE_LENGTH);
  const priceDigest = sha256.hash(priceBytes);
  const timeDigest = sha256.hash(timeBytes);
  return concatBytes([DOMAIN_TAG_BYTES, feedBytes, priceDigest, timeDigest]);
}

export interface OracleSignatureResult {
  signatureHex: string;
  messagePreimageHex: string;
  messageHashHex: string;
}

export function signOracleMessage(
  params: OracleMessageParams,
  privateKeyHex: string
): OracleSignatureResult {
  const message = buildOracleMessage(params);
  const messageHash = hash256(message);
  const privateKey = hexToBin(stripHexPrefix(privateKeyHex));
  const signature = secp256k1.signMessageHashDER(privateKey, messageHash);
  if (typeof signature === 'string') {
    throw new Error(signature);
  }
  return {
    signatureHex: binToHex(signature),
    messagePreimageHex: binToHex(message),
    messageHashHex: binToHex(messageHash),
  };
}

export function verifyOracleSignature(
  params: OracleMessageParams,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  const message = buildOracleMessage(params);
  const messageHash = hash256(message);
  const signature = hexToBin(stripHexPrefix(signatureHex));
  const publicKey = hexToBin(stripHexPrefix(publicKeyHex));
  return secp256k1.verifySignatureDER(signature, publicKey, messageHash);
}

export function toHex(bytes: Uint8Array): string {
  return binToHex(bytes);
}
