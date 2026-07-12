import type { Address } from 'viem';

import type { BrandIconName } from '../components/BrandIcon';
import { colors } from '../theme/colors';

export type TokenSymbol = 'ETH' | 'USDC' | 'USDT' | 'KOMBAT';

/** Chains we can read on-chain balances for. */
export type BalanceChainId = 'base' | 'sepolia';

export type Token = {
  symbol: TokenSymbol;
  name: string;
  decimals: number;
  brand?: BrandIconName;
  glyph?: string;
  tint: string;
  /** Native coin (ETH) - read via multicall3.getEthBalance, no token address. */
  native?: boolean;
  address?: Address;
  /** Pegged to $1 - used for the USD total until a price feed exists. */
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

/** Shown on every chain; without an address it renders as no funds. */
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
  ],
  sepolia: [
    // Must match the MatchEscrow allowlist (apps/evm-contracts/README.md) -
    // staking pulls these exact tokens.
    KOMBAT('0xFE25C2b2400144c6536b9F707F06b751D6eeF943'),
    ETH,
    USDC('0x277c9f3957633C99ef8F7421B980B50C41b31a7b'),
    USDT(),
  ],
};

export function supportsBalances(chainId: string): chainId is BalanceChainId {
  return chainId === 'base' || chainId === 'sepolia';
}

/** Chainlink ETH/USD aggregators (answer is 8 decimals). */
export const ETH_USD_FEED: Record<BalanceChainId, Address> = {
  base: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
  sepolia: '0x694AA1769357215DE4FAC081bf1f309aDC325306',
};

export const ETH_USD_FEED_DECIMALS = 8;
