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

// Get contract balance via backend API
export async function getContractBalance(address: string, network: string): Promise<bigint> {
  const response = await fetch(`/api/balance?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}`);
  const data = await response.json() as { balance?: string; error?: string };

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Failed to get balance');
  }

  return BigInt(data.balance || '0');
}
