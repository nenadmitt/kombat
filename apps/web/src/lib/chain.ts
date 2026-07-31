import type { Address } from "viem";

/** Sepolia during the closed test - the only chain the pot is deployed on. */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");

export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}` as const;

export const STAKE_POT_ADDRESS = (process.env.NEXT_PUBLIC_STAKE_POT_ADDRESS ??
  "") as Address;

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.etherscan.io";

/** The pot's own name for "no token" - what stakeNative deposits under. */
export const NATIVE_TOKEN =
  "0x0000000000000000000000000000000000000000" as Address;

export type StakeToken = {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  native?: boolean;
};

/**
 * Mirrors apps/server/src/chain/token-registry.ts, which is itself pinned to
 * the pot's on-chain allowlist. Adding a token means all three.
 */
export const TOKENS: StakeToken[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x277c9f3957633C99ef8F7421B980B50C41b31a7b",
    decimals: 6,
  },
  {
    symbol: "KOMBAT",
    name: "Kombat Coin",
    address: "0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0",
    decimals: 18,
  },
  {
    symbol: "ETH",
    name: "Sepolia Ether",
    address: NATIVE_TOKEN,
    decimals: 18,
    native: true,
  },
];

export const STAKE_POT_ABI = [
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [
      { name: "beneficiary", type: "address" },
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "stakeNative",
    stateMutability: "payable",
    inputs: [{ name: "beneficiary", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "allowedTokens",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
