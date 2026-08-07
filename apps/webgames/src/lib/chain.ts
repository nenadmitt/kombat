import { NATIVE_TOKEN_ADDRESS, tokensForChain } from '@gaming-platform/core';
import type { TokenInfo } from '@gaming-platform/core';
import type { Address } from 'viem';

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? '11155111');

/** Only chains we can name honestly. An unknown id gets no testnet claim -
 *  calling mainnet a testnet is the one mistake that costs a user real money. */
const CHAINS: Record<number, { name: string; testnet: boolean }> = {
  1: { name: 'Ethereum', testnet: false },
  8453: { name: 'Base', testnet: false },
  11155111: { name: 'Sepolia', testnet: true },
  17000: { name: 'Holesky', testnet: true },
  84532: { name: 'Base Sepolia', testnet: true },
};

export const CHAIN_NAME = CHAINS[CHAIN_ID]?.name ?? `chain ${CHAIN_ID}`;

export const IS_TESTNET = CHAINS[CHAIN_ID]?.testnet ?? false;

export const RPC_URL =
  import.meta.env.VITE_RPC_URL ??
  'https://eth-sepolia.g.alchemy.com/v2/kSLvIkdb8hKaBbTvK_5txOVuSgawItyv';

export const EXPLORER_URL =
  import.meta.env.VITE_EXPLORER_URL ?? 'https://sepolia.etherscan.io';

/** The pot's own name for "no token" - what stakeNative deposits under. */
export const NATIVE_TOKEN = NATIVE_TOKEN_ADDRESS as Address;

export const TOKENS: TokenInfo[] = tokensForChain(CHAIN_ID);

export const STAKE_POT_ABI = [
  {
    type: 'function',
    name: 'stake',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'beneficiary', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'stakeNative',
    stateMutability: 'payable',
    inputs: [{ name: 'beneficiary', type: 'address' }],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
