import type { CashScriptArtifact, ConstructorArg, DeployedContract } from '../types';

function serializeConstructorArgs(args: ConstructorArg[]): ConstructorArg[] {
  return args.map((arg) => {
    if (typeof arg.value === 'bigint') {
      return { ...arg, value: arg.value.toString() };
    }
    return arg;
  });
}

// Deploy contract via backend API (supports multiple networks)
export async function deployContract(
  artifact: CashScriptArtifact,
  constructorArgs: ConstructorArg[],
  network: string,
): Promise<DeployedContract> {
  const serializedArgs = serializeConstructorArgs(constructorArgs);
  const response = await fetch('/api/deploy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ artifact, constructorArgs: serializedArgs, network }),
  });

  const data = await response.json() as { address?: string; error?: string };

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Deployment failed');
  }

  return {
    address: data.address!,
    artifact,
    constructorArgs,
  };
}

// Fund a deployed contract address from the wallet
export async function fundContractAddress(
  contractAddress: string,
  walletWif: string,
  walletCashAddress: string,
  amountSats: bigint,
  network: string,
): Promise<{ txid: string }> {
  const response = await fetch('/api/fund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractAddress,
      walletWif,
      walletCashAddress,
      amountSats: amountSats.toString(),
      network,
    }),
  });

  const data = await response.json() as { txid?: string; error?: string };

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Funding failed');
  }

  return { txid: data.txid! };
}

// Get contract balance via backend API
export async function getContractBalance(address: string, network: string): Promise<bigint> {
  const response = await fetch(`/api/balance?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}`);
  const data = await response.json() as { balance?: string; error?: string };

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Failed to get balance');
  }

  return BigInt(data.balance || '0');
}
