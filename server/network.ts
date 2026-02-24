import { Network } from 'cashscript';

const DEFAULT_NETWORK = Network.CHIPNET;

export function resolveNetworkParam(value?: string): Network {
  if (!value) return DEFAULT_NETWORK;
  switch (value.toUpperCase()) {
    case 'MAINNET':
    case 'LIVENET':
      return Network.MAINNET;
    case 'TESTNET':
    case 'TESTNET3':
      return Network.TESTNET3;
    case 'TESTNET4':
      return Network.TESTNET4;
    case 'CHIPNET':
      return Network.CHIPNET;
    default:
      return DEFAULT_NETWORK;
  }
}
