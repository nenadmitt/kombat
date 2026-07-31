import type { BrandIconName } from '../components/BrandIcon';

export type ChainId = 'base' | 'sepolia';

export type Chain = {
  id: ChainId;
  name: string;
  network: string;
  icon: BrandIconName;
  enabled: boolean;
};

export const CHAINS: Chain[] = [
  {
    id: 'sepolia',
    name: 'Sepolia',
    network: 'Ethereum Sepolia',
    icon: 'ethereum',
    enabled: true,
  },
  { id: 'base', name: 'Base', network: 'Base', icon: 'base', enabled: false },
];

export const DEFAULT_CHAIN_ID: ChainId = 'sepolia';
