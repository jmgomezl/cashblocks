import type { CashScriptArtifact, ConstructorArg } from '../types';

export interface StoredDeployment {
  id: string;
  address: string;
  network: string;
  createdAt: number;
  artifact: CashScriptArtifact;
  constructorArgs: ConstructorArg[];
}

const STORAGE_PREFIX = 'cashblocks_deployments';

function storageKey(network: string): string {
  return `${STORAGE_PREFIX}_${network}`;
}

export function loadDeployments(network: string): StoredDeployment[] {
  try {
    const raw = localStorage.getItem(storageKey(network));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredDeployment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDeployment(record: StoredDeployment): void {
  if (!record.network) return;
  const list = loadDeployments(record.network);
  const existingIndex = list.findIndex((item) => item.id === record.id);
  if (existingIndex >= 0) {
    list[existingIndex] = record;
  } else {
    list.unshift(record);
  }
  localStorage.setItem(storageKey(record.network), JSON.stringify(list.slice(0, 20)));
}

function serializeArgs(args: ConstructorArg[]): ConstructorArg[] {
  return args.map((arg) => {
    const value = typeof arg.value === 'bigint' ? arg.value.toString() : arg.value;
    return { ...arg, value };
  });
}

export function createDeploymentRecord(params: {
  address: string;
  network: string;
  artifact: CashScriptArtifact;
  constructorArgs: ConstructorArg[];
}): StoredDeployment {
  return {
    id: `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    address: params.address,
    network: params.network,
    artifact: params.artifact,
    constructorArgs: serializeArgs(params.constructorArgs),
    createdAt: Date.now(),
  };
}
