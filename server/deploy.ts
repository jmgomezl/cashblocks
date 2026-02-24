import { ElectrumNetworkProvider, Contract, Network } from 'cashscript';
import type { Artifact } from 'cashscript';

export interface ConstructorArg {
  name: string;
  type: 'bytes20' | 'int' | 'bytes' | 'pubkey' | 'sig';
  value?: string | bigint;
}

interface DeployRequest {
  artifact: Artifact;
  constructorArgs: ConstructorArg[];
}

interface DeployResponse {
  address?: string;
  error?: string;
}

const providerCache = new Map<Network, ElectrumNetworkProvider>();

export function getProvider(network: Network): ElectrumNetworkProvider {
  if (!providerCache.has(network)) {
    providerCache.set(network, new ElectrumNetworkProvider(network));
  }
  return providerCache.get(network)!;
}

// Deploy contract to specified network
export async function deployToNetwork(
  request: DeployRequest,
  network: Network,
): Promise<DeployResponse> {
  try {
    const networkProvider = getProvider(network);

    // Build args in the order defined by the artifact's constructorInputs,
    // matching by name so the caller's ordering never matters.
    const argMap = new Map(request.constructorArgs.map((a) => [a.name, a]));
    const args = request.artifact.constructorInputs.map((input) => {
      const arg = argMap.get(input.name);
      if (!arg) throw new Error(`Missing constructor arg: ${input.name}`);
      if (arg.type === 'bytes20' || arg.type === 'bytes') {
        return arg.value as string;
      }
      if (arg.type === 'int') {
        return typeof arg.value === 'bigint' ? arg.value : BigInt(arg.value ?? 0);
      }
      return arg.value;
    });

    // Create contract instance
    const contract = new Contract(request.artifact, args, { provider: networkProvider });

    // Ensure address is a string
    const address = typeof contract.address === 'string'
      ? contract.address
      : String(contract.address);

    return { address };
  } catch (err) {
    const error = err as Error;
    return { error: `Deployment error: ${error.message}` };
  }
}

// Get balance for an address
export async function getBalance(
  address: string,
  network: Network,
): Promise<{ balance?: string; error?: string }> {
  try {
    const networkProvider = getProvider(network);
    const utxos = await networkProvider.getUtxos(address);
    const balance = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
    return { balance: balance.toString() };
  } catch (err) {
    const error = err as Error;
    return { error: `Balance error: ${error.message}` };
  }
}

// Validate deploy request
export function validateDeployRequest(body: unknown): DeployRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const req = body as Record<string, unknown>;
  if (!req.artifact || typeof req.artifact !== 'object') {
    return null;
  }
  if (!Array.isArray(req.constructorArgs)) {
    return null;
  }
  return req as unknown as DeployRequest;
}
