import { StakeAsset } from '../games/stake.types';

export type TokenSymbol = 'ETH' | 'KOMBAT' | 'USDC' | 'USDT' | 'DAI';

export type TokenInfo = {
  symbol: TokenSymbol;
  name: string;
  /** 0x-prefixed ERC20 address; the zero address marks the chain's native coin. */
  address: string;
  decimals: number;
  native?: boolean;
  /** Set when the pot accepts this token for match stakes. */
  stakeAsset?: StakeAsset;
};

export const NATIVE_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000';

/**
 * Canonical token addresses per chain, hardcoded on purpose: these are
 * facts about a chain, not deployment configuration. Stake-enabled entries
 * must match the pot's on-chain allowlist (apps/evm-contracts/README.md).
 */
export const CHAIN_TOKENS: Record<number, TokenInfo[]> = {
  // Sepolia, the closed-test chain. No USDT/DAI deployments here.
  11155111: [
    {
      symbol: 'ETH',
      name: 'Sepolia Ether',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      native: true,
      stakeAsset: StakeAsset.Native,
    },
    {
      symbol: 'KOMBAT',
      name: 'Kombat Coin',
      address: '0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0',
      decimals: 18,
      stakeAsset: StakeAsset.Kombat,
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      decimals: 6,
      stakeAsset: StakeAsset.Usdc,
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      address: '0x776b6fC2eD15D6Bb5Fc32e0c89DE68683118c62A',
      decimals: 18,
      stakeAsset: StakeAsset.Dai,
    },
    // USDT has no Sepolia deployment, so it is absent here on purpose.
  ],
  // Ethereum mainnet. Transfers only until the pot deploys there.
  1: [
    {
      symbol: 'ETH',
      name: 'Ether',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      native: true,
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      stakeAsset: StakeAsset.Usdt,
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      decimals: 18,
      stakeAsset: StakeAsset.Dai,
    },
  ],
};

export function tokensForChain(chainId: number): TokenInfo[] {
  return CHAIN_TOKENS[chainId] ?? [];
}

export function findToken(
  chainId: number,
  symbol: TokenSymbol,
): TokenInfo | undefined {
  return tokensForChain(chainId).find(token => token.symbol === symbol);
}

/** ERC20 address per stake asset for a chain (native excluded, it has none). */
export function stakeAssetAddresses(
  chainId: number,
): Partial<Record<StakeAsset, string>> {
  const out: Partial<Record<StakeAsset, string>> = {};
  for (const token of tokensForChain(chainId)) {
    if (token.stakeAsset !== undefined && !token.native) {
      out[token.stakeAsset] = token.address;
    }
  }
  return out;
}
