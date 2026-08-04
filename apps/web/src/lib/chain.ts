import { NATIVE_TOKEN_ADDRESS, tokensForChain } from "@gaming-platform/core";
import type { TokenInfo } from "@gaming-platform/core";
import type { Address } from "viem";

/** Sepolia during the closed test - the only chain the pot is deployed on. */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");

export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}` as const;

export const STAKE_POT_ADDRESS = (process.env.NEXT_PUBLIC_STAKE_POT_ADDRESS ??
  "") as Address;

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.etherscan.io";

/** The pot's own name for "no token" - what stakeNative deposits under. */
export const NATIVE_TOKEN = NATIVE_TOKEN_ADDRESS as Address;

export type StakeToken = TokenInfo;

export const TOKENS: StakeToken[] = tokensForChain(CHAIN_ID);

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
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
