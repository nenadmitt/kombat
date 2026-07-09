import { erc20Abi, parseAbi, type Address } from 'viem';

import {
  CHAIN_TOKENS,
  ETH_USD_FEED,
  type BalanceChainId,
  type TokenSymbol,
} from './tokens';
import { getPublicClient, VIEM_CHAIN } from './rpc';

const getEthBalanceAbi = parseAbi([
  'function getEthBalance(address addr) view returns (uint256)',
]);

const aggregatorAbi = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

/** null = the call failed (e.g. placeholder address) and should render as unavailable. */
export type RawBalances = Partial<Record<TokenSymbol, bigint | null>>;

export type BalancesResult = {
  balances: RawBalances;
  /** ETH/USD price from Chainlink, 8 decimals; null if the feed call failed. */
  ethUsdPrice: bigint | null;
};

/**
 * Reads every token balance for `address` plus the ETH/USD price on `chainId`
 * in a single multicall.
 */
export async function fetchBalances(
  chainId: BalanceChainId,
  address: Address,
): Promise<BalancesResult> {
  const client = getPublicClient(chainId);
  const multicall3 = VIEM_CHAIN[chainId].contracts.multicall3.address;

  // Tokens without an address (e.g. KOMBAT on a chain it isn't deployed to) are
  // skipped here and reported as zero by the store.
  const tokens = CHAIN_TOKENS[chainId].filter(
    token => token.native || token.address,
  );

  const balanceContracts = tokens.map(token =>
    token.native
      ? {
          address: multicall3,
          abi: getEthBalanceAbi,
          functionName: 'getEthBalance',
          args: [address],
        }
      : {
          address: token.address as Address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        },
  );

  const priceContract = {
    address: ETH_USD_FEED[chainId],
    abi: aggregatorAbi,
    functionName: 'latestRoundData',
    args: [],
  };

  const results = await client.multicall({
    contracts: [...balanceContracts, priceContract],
    allowFailure: true,
  });

  const balances: RawBalances = {};
  tokens.forEach((token, i) => {
    const result = results[i];
    balances[token.symbol] =
      result.status === 'success' ? (result.result as bigint) : null;
  });

  const priceResult = results[tokens.length];
  const ethUsdPrice =
    priceResult.status === 'success'
      ? (priceResult.result as readonly bigint[])[1]
      : null;

  return { balances, ethUsdPrice };
}
