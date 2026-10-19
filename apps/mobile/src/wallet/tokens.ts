import type { Address } from 'viem';

import type { BrandIconName } from '../components/BrandIcon';
import { colors } from '../theme/colors';

export type TokenSymbol = 'ETH' | 'USDC' | 'USDT' | 'DAI' | 'KOMBAT';

export type BalanceChainId = 'base' | 'sepolia';

export type Token = {
  symbol: TokenSymbol;
  name: string;
  decimals: number;
  brand?: BrandIconName;
  glyph?: string;
  tint: string;
  native?: boolean;
  address?: Address;
  stable?: boolean;
};

const ETH: Token = {
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  brand: 'eth',
  tint: '#627EEA',
  native: true,
};

const USDC = (address?: Address): Token => ({
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  brand: 'usdc',
  tint: '#2775CA',
  stable: true,
  address,
});

const USDT = (address?: Address): Token => ({
  symbol: 'USDT',
  name: 'Tether',
  decimals: 6,
  brand: 'usdt',
  tint: '#26A17B',
  stable: true,
  address,
});

const DAI = (address?: Address): Token => ({
  symbol: 'DAI',
  name: 'Dai',
  decimals: 18,
  brand: 'dai',
  tint: '#F5AC37',
  stable: true,
  address,
});

const KOMBAT = (address?: Address): Token => ({
  symbol: 'KOMBAT',
  name: 'Platform Token',
  decimals: 18,
  glyph: '◆',
  tint: colors.gold,
  address,
});

export const CHAIN_TOKENS: Record<BalanceChainId, Token[]> = {
  base: [
    KOMBAT(),
    ETH,
    USDC('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
    USDT('0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'),
    DAI('0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'),
  ],
  sepolia: [
    // Must match the StakePot allowlist and the server's TOKEN_REGISTRY: deposits pull these exact tokens.
    KOMBAT('0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0'),
    ETH,
    USDC('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'),
    USDT(),
    DAI('0x776b6fC2eD15D6Bb5Fc32e0c89DE68683118c62A'),
  ],
};

export function supportsBalances(chainId: string): chainId is BalanceChainId {
  return chainId === 'base' || chainId === 'sepolia';
}

export const ETH_USD_FEED: Record<BalanceChainId, Address> = {
  base: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
  sepolia: '0x694AA1769357215DE4FAC081bf1f309aDC325306',
};

export const ETH_USD_FEED_DECIMALS = 8;
