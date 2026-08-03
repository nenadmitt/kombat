import { StakeAsset } from '@gaming-platform/core';

import { CHAIN_TOKENS, type BalanceChainId, type Token, type TokenSymbol } from './tokens';

/**
 * The pot accounts in StakeAsset; the wallet UI works in TokenSymbol. ETH is
 * wallet/gas only - it never appears in the pot.
 */
export const POT_ASSETS: { asset: StakeAsset; symbol: TokenSymbol }[] = [
  { asset: StakeAsset.Kombat, symbol: 'KOMBAT' },
  { asset: StakeAsset.Usdc, symbol: 'USDC' },
  { asset: StakeAsset.Usdt, symbol: 'USDT' },
  { asset: StakeAsset.Dai, symbol: 'DAI' },
];

export function symbolForAsset(asset: StakeAsset): TokenSymbol {
  return POT_ASSETS.find(entry => entry.asset === asset)!.symbol;
}

/** The wallet token backing a pot asset on this chain, if it exists there. */
export function tokenForAsset(
  chainId: BalanceChainId,
  asset: StakeAsset,
): Token | undefined {
  const symbol = symbolForAsset(asset);
  return CHAIN_TOKENS[chainId].find(token => token.symbol === symbol);
}
