import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOracleMessage,
  signOracleMessage,
} from '../src/oracle';
import {
  binToHex,
  hash256,
  hexToBin,
  secp256k1,
  utf8ToBin,
} from '@bitauth/libauth';

interface ContractState {
  oraclePubKeyHex: string;
  ownerPubKeyHex: string;
  minPrice: bigint;
  freshnessWindow: bigint;
  maxMinerFee: bigint;
  activeBytecodeHex: string;
}

interface SpendAttempt {
  price: bigint;
  timestamp: bigint;
  txTime: bigint;
  feedId: string;
  oracleSigHex: string;
  ownerApproved: boolean;
  inputValue: bigint;
  outputValue: bigint;
  outputLockingBytecodeHex: string;
}

const stripHex = (value: string): string => (value.startsWith('0x') ? value.slice(2) : value);

const oraclePrivateKeyHex = '7a54fb5397a006203b01dbea1261d6ae2bc497bb7d5005c45e26dfec35373601';
const oraclePublicKeyHex = binToHex(
  secp256k1.derivePublicKeyCompressed(hexToBin(oraclePrivateKeyHex))
);

const ownerPrivateKeyHex = '5d322d8c8bccbd02c74b3a2765a490d57d4c88890be671c5f3cf1911091cf002';
const ownerPublicKeyHex = binToHex(
  secp256k1.derivePublicKeyCompressed(hexToBin(ownerPrivateKeyHex))
);

const dummyActiveBytecodeHex = binToHex(utf8ToBin('oracle-managed-vault-redeem'));
const expectedLockingHex = buildP2sh32Locking(dummyActiveBytecodeHex);

const baseState: ContractState = {
  oraclePubKeyHex: oraclePublicKeyHex,
  ownerPubKeyHex: ownerPublicKeyHex,
  minPrice: 500n,
  freshnessWindow: 2n * 60n * 60n,
  maxMinerFee: 1500n,
  activeBytecodeHex: dummyActiveBytecodeHex,
};

const feedId = 'feedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed';

function buildP2sh32Locking(redeemScriptHex: string): string {
  const redeem = hexToBin(stripHex(redeemScriptHex));
  const scriptHash = hash256(redeem);
  const script = new Uint8Array(1 + 1 + scriptHash.length + 1);
  script[0] = 0xaa;
  script[1] = scriptHash.length;
  script.set(scriptHash, 2);
  script[script.length - 1] = 0x87;
  return binToHex(script);
}

function buildAttempt(overrides: Partial<SpendAttempt> = {}): SpendAttempt {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const timestamp = overrides.timestamp ?? (now - 60n);
  const price = overrides.price ?? 550n;
  const { signatureHex } = signOracleMessage(
    { feedId, price, timestamp },
    oraclePrivateKeyHex
  );
  return {
    price,
    timestamp,
    txTime: overrides.txTime ?? (timestamp + 30n),
    feedId: overrides.feedId ?? feedId,
    oracleSigHex: overrides.oracleSigHex ?? signatureHex,
    ownerApproved: overrides.ownerApproved ?? true,
    inputValue: overrides.inputValue ?? 100_000n,
    outputValue: overrides.outputValue ?? 99_000n,
    outputLockingBytecodeHex:
      overrides.outputLockingBytecodeHex ?? expectedLockingHex,
  };
}

function simulateVaultSpend(state: ContractState, attempt: SpendAttempt): void {
  const message = buildOracleMessage({
    feedId: attempt.feedId,
    price: attempt.price,
    timestamp: attempt.timestamp,
  });
  const messageHash = hash256(message);
  const signature = hexToBin(stripHex(attempt.oracleSigHex));
  const oraclePubKey = hexToBin(stripHex(state.oraclePubKeyHex));
  const verified = secp256k1.verifySignatureDER(signature, oraclePubKey, messageHash);
  if (!verified) {
    throw new Error('Invalid oracle signature');
  }
  if (attempt.price < state.minPrice) {
    throw new Error('Price below threshold');
  }
  if (attempt.txTime < attempt.timestamp) {
    throw new Error('Timestamp from future');
  }
  if (attempt.txTime > attempt.timestamp + state.freshnessWindow) {
    throw new Error('Oracle data stale');
  }
  if (!attempt.ownerApproved) {
    throw new Error('Owner signature missing');
  }
  const expected = buildP2sh32Locking(state.activeBytecodeHex);
  if (attempt.outputLockingBytecodeHex.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('Output 0 must pay vault address');
  }
  const minerFee = attempt.inputValue - attempt.outputValue;
  if (minerFee < 0n) {
    throw new Error('Output cannot exceed input value');
  }
  if (minerFee > state.maxMinerFee) {
    throw new Error('Miner fee too high');
  }
}

test('accepts valid oracle spend with fresh data', () => {
  const attempt = buildAttempt();
  assert.doesNotThrow(() => simulateVaultSpend(baseState, attempt));
});

test('rejects spend when oracle price is below minPrice', () => {
  const attempt = buildAttempt({ price: 450n });
  assert.throws(
    () => simulateVaultSpend(baseState, attempt),
    /Price below threshold/
  );
});

test('rejects spend when oracle timestamp is stale', () => {
  const staleTimestamp =
    BigInt(Math.floor(Date.now() / 1000)) - baseState.freshnessWindow - 10n;
  const attempt = buildAttempt({
    timestamp: staleTimestamp,
    txTime: staleTimestamp + baseState.freshnessWindow + 10n,
  });
  assert.throws(
    () => simulateVaultSpend(baseState, attempt),
    /Oracle data stale/
  );
});

test('rejects spend when oracle signature is invalid', () => {
  const valid = buildAttempt();
  const tampered = { ...valid, price: valid.price + 10n };
  assert.throws(
    () => simulateVaultSpend(baseState, tampered),
    /Invalid oracle signature/
  );
});

test('rejects spend when output 0 does not pay vault', () => {
  const differentLocking = binToHex(utf8ToBin('not-the-vault'));
  const attempt = buildAttempt({ outputLockingBytecodeHex: differentLocking });
  assert.throws(
    () => simulateVaultSpend(baseState, attempt),
    /Output 0 must pay vault/
  );
});

test('rejects spend when miner fee exceeds allowance', () => {
  const attempt = buildAttempt({ outputValue: 98_000n });
  assert.throws(
    () => simulateVaultSpend(baseState, attempt),
    /Miner fee too high/
  );
});

test('rejects spend without owner approval flag', () => {
  const attempt = buildAttempt({ ownerApproved: false });
  assert.throws(
    () => simulateVaultSpend(baseState, attempt),
    /Owner signature missing/
  );
});
