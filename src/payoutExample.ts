import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Contract,
  ElectrumNetworkProvider,
  Network,
  SignatureTemplate,
} from 'cashscript';
import {
  decodePrivateKeyWif,
  decodeCashAddress,
  secp256k1,
  binToHex,
} from '@bitauth/libauth';

async function loadArtifact() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const artifactPath = resolve(__dirname, '../contracts/PayoutAndRelock.json');
  const raw = await readFile(artifactPath, 'utf8');
  return JSON.parse(raw);
}

async function buildTransaction() {
  const artifact = await loadArtifact();
  const ownerWif = process.env.OWNER_WIF ?? 'L1exampleWifReplaceMe';
  const decoded = decodePrivateKeyWif(ownerWif);
  if (typeof decoded === 'string') throw new Error(decoded);
  const derivedPk = secp256k1.derivePublicKeyCompressed(decoded.privateKey);
  if (typeof derivedPk === 'string') throw new Error(derivedPk);
  const ownerPk = binToHex(derivedPk);

  const recipientAddress = 'bchtest:qqj8hvf9tn2xax6r0s599eg3h7x9vafv8a5wh6v37a';
  const decodedAddr = decodeCashAddress(recipientAddress);
  if (typeof decodedAddr === 'string') throw new Error(decodedAddr);
  const recipientPkh = decodedAddr.payload as Uint8Array;

  const minPayout = 10_000n;
  const maxMinerFee = 1_500n;

  const provider = new ElectrumNetworkProvider(Network.CHIPNET);
  const contract = new Contract(
    artifact,
    [ownerPk, recipientPkh, minPayout, maxMinerFee],
    { provider },
  );

  const utxo = {
    txid: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    vout: 0,
    satoshis: 50_000n,
    token: undefined,
  };

  const minerFee = 800n;
  const payoutAmount = 15_000n;
  const changeAmount = utxo.satoshis - payoutAmount - minerFee;

  const validTx = contract.functions
    .execute(new SignatureTemplate(ownerWif))
    .from(utxo)
    .withHardcodedFee(minerFee)
    .to(recipientAddress, payoutAmount)
    .to(contract.address, changeAmount);

  const rawTx = await validTx.build();
  console.log('Valid tx hex (2 outputs, 1 input):', rawTx);

  try {
    await contract.functions
      .execute(new SignatureTemplate(ownerWif))
      .from(utxo)
      .withHardcodedFee(minerFee)
      .to(recipientAddress, payoutAmount)
      .withOpReturn(['leak'])
      .send();
  } catch (err) {
    console.error('Expected failure (extra output added):', err);
  }

  try {
    await contract.functions
      .execute(new SignatureTemplate(ownerWif))
      .from(utxo)
      .withHardcodedFee(maxMinerFee + 1n)
      .to(recipientAddress, payoutAmount)
      .to(contract.address, changeAmount)
      .send();
  } catch (err) {
    console.error('Expected failure (fee too high):', err);
  }
}

buildTransaction().catch((err) => {
  console.error(err);
  process.exit(1);
});
