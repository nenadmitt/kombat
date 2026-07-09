import type { BrandIconName } from '../components/BrandIcon';

export type ChainId = 'base' | 'sepolia' | 'ethereum' | 'solana';

export type Chain = {
  id: ChainId;
  name: string;
  network: string;
  icon: BrandIconName;
  enabled: boolean;
};

/** Placeholder until Solana wallets are actually derived. */
export const PLACEHOLDER_SOLANA_ADDRESS =
  'So1anaPLAicehoLder1111111111111111111111111';

export const CHAINS: Chain[] = [
  {
    id: 'sepolia',
    name: 'Sepolia',
    network: 'Ethereum Sepolia',
    icon: 'ethereum',
    enabled: true,
  },
  { id: 'base', name: 'Base', network: 'Base', icon: 'base', enabled: true },
  {
    id: 'ethereum',
    name: 'Ethereum',
    network: 'Ethereum Mainnet',
    icon: 'ethereum',
    enabled: false,
  },
  {
    id: 'solana',
    name: 'Solana',
    network: 'Solana',
    icon: 'solana',
    enabled: false,
  },
];

export const DEFAULT_CHAIN_ID: ChainId = 'sepolia';

export function addressForChain(chainId: ChainId, evmAddress: string): string {
  return chainId === 'solana' ? PLACEHOLDER_SOLANA_ADDRESS : evmAddress;
}
