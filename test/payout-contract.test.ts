import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToBin, binToHex, hash256 } from '@bitauth/libauth';

interface ContractState {
  ownerPkHex: string;
  recipientPkhHex: string;
  minPayout: bigint;
  maxMinerFee: bigint;
  activeBytecodeHex: string;
}

interface SpendAttempt {
  ownerSigValid: boolean;
  inputsLength: number;
  outputsLength: number;
  activeInputIndex: number;
  inputValue: bigint;
  output0Value: bigint;
  output1Value: bigint;
  output0LockingHex: string;
  output1LockingHex: string;
}

const state: ContractState = {
  ownerPkHex: '020202020202020202020202020202020202020202020202020202020202020202',
  recipientPkhHex: 'f4b4e67c87d5d88fff9f271a1f25a4be0d1a1234',
  minPayout: 12_000n,
  maxMinerFee: 1_200n,
  activeBytecodeHex: binToHex(hexToBin('511111')), // dummy
};

const recipientLocking = buildP2pkhLock(state.recipientPkhHex);
const relockLocking = buildP2sh32Lock(state.activeBytecodeHex);

function buildP2pkhLock(pkhHex: string): string {
  const pkh = hexToBin(pkhHex);
  const script = new Uint8Array(25);
  script.set([0x76, 0xa9, 0x14], 0);
  script.set(pkh, 3);
  script.set([0x88, 0xac], 23);
  return binToHex(script);
}

function buildP2sh32Lock(bytecodeHex: string): string {
  const redeem = hexToBin(bytecodeHex);
  const scriptHash = hash256(redeem);
  const script = new Uint8Array(34);
  script[0] = 0xaa;
  script[1] = 0x20;
  script.set(scriptHash, 2);
  script[33] = 0x87;
  return binToHex(script);
}

function simulateSpend(attempt: SpendAttempt): void {
  if (state.recipientPkhHex.length !== 40) {
    throw new Error('Recipient hash is not bytes20');
  }
  if (!attempt.ownerSigValid) {
    throw new Error('Owner signature invalid');
  }
  if (attempt.inputsLength !== 1) {
    throw new Error('Transaction must have exactly one input');
  }
  if (attempt.activeInputIndex !== 0) {
    throw new Error('Contract input is not the active input');
  }
  if (attempt.outputsLength !== 2) {
    throw new Error('Transaction must have exactly two outputs');
  }
  if (attempt.output0LockingHex.toLowerCase() !== recipientLocking.toLowerCase()) {
    throw new Error('Payout must go to fixed recipient');
  }
  if (attempt.output0Value < state.minPayout) {
    throw new Error('Payout below minimum');
  }
  if (attempt.output1LockingHex.toLowerCase() !== relockLocking.toLowerCase()) {
    throw new Error('Relock output incorrect');
  }
  if (attempt.output1Value < 546n) {
    throw new Error('Relock output dust');
  }
  const totalOutputs = attempt.output0Value + attempt.output1Value;
  if (totalOutputs > attempt.inputValue) {
    throw new Error('Outputs exceed input');
  }
  const minerFee = attempt.inputValue - totalOutputs;
  if (minerFee > state.maxMinerFee) {
    throw new Error('Miner fee too high');
  }
}

test('passes when signature, outputs, and fees match policy', () => {
  const attempt: SpendAttempt = {
    ownerSigValid: true,
    inputsLength: 1,
    outputsLength: 2,
    activeInputIndex: 0,
    inputValue: 50_000n,
    output0Value: 20_000n,
    output1Value: 28_800n,
    output0LockingHex: recipientLocking,
    output1LockingHex: relockLocking,
  };
  assert.doesNotThrow(() => simulateSpend(attempt));
});

test('fails when attacker supplies their own pubkey/signature', () => {
  const attempt = { ...validAttempt(), ownerSigValid: false };
  assert.throws(() => simulateSpend(attempt), /Owner signature invalid/);
});

test('fails when contract input is not the active input', () => {
  const attempt = { ...validAttempt(), activeInputIndex: 1 };
  assert.throws(
    () => simulateSpend(attempt),
    /Contract input is not the active input/
  );
});

test('fails when outputs length deviates from 2', () => {
  const attempt = { ...validAttempt(), outputsLength: 3 };
  assert.throws(
    () => simulateSpend(attempt),
    /Transaction must have exactly two outputs/
  );
});

test('fails when relock output does not pay the contract', () => {
  const attempt = { ...validAttempt(), output1LockingHex: recipientLocking };
  assert.throws(() => simulateSpend(attempt), /Relock output incorrect/);
});

test('fails when miner fee exceeds limit', () => {
  const attempt = { ...validAttempt(), output1Value: 20_000n };
  assert.throws(() => simulateSpend(attempt), /Miner fee too high/);
});

function validAttempt(): SpendAttempt {
  return {
    ownerSigValid: true,
    inputsLength: 1,
    outputsLength: 2,
    activeInputIndex: 0,
    inputValue: 50_000n,
    output0Value: 20_000n,
    output1Value: 29_000n,
    output0LockingHex: recipientLocking,
    output1LockingHex: relockLocking,
  };
}
