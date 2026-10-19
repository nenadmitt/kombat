import { StakeAsset } from '@gaming-platform/core';

import { CHAIN_TOKENS, type BalanceChainId, type Token, type TokenSymbol } from './tokens';

export const POT_ASSETS: { asset: StakeAsset; symbol: TokenSymbol }[] = [
  { asset: StakeAsset.Kombat, symbol: 'KOMBAT' },
  { asset: StakeAsset.Usdc, symbol: 'USDC' },
  { asset: StakeAsset.Usdt, symbol: 'USDT' },
  { asset: StakeAsset.Dai, symbol: 'DAI' },
];

export function symbolForAsset(asset: StakeAsset): TokenSymbol {
  return POT_ASSETS.find(entry => entry.asset === asset)!.symbol;
}

export function tokenForAsset(
  chainId: BalanceChainId,
  asset: StakeAsset,
): Token | undefined {
  const symbol = symbolForAsset(asset);
  return CHAIN_TOKENS[chainId].find(token => token.symbol === symbol);
}
