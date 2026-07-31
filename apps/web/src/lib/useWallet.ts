"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  type Address,
  type EIP1193Provider,
} from "viem";

import { CHAIN_ID, EXPLORER_URL } from "./chain";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const chain = defineChain({
  id: CHAIN_ID,
  name: "Ethereum Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] } },
  blockExplorers: { default: { name: "Etherscan", url: EXPLORER_URL } },
});

export type WalletState = {
  provider: EIP1193Provider | undefined;
  account: Address | undefined;
  connecting: boolean;
  error: string | undefined;
  hasWallet: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
};

function message(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Something went wrong";
}

export function useWallet(): WalletState {
  const [provider, setProvider] = useState<EIP1193Provider>();
  const [account, setAccount] = useState<Address>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const injected = window.ethereum;
    if (!injected) {
      return;
    }
    setProvider(injected);

    // No eth_accounts probe on mount. It returns an already-authorised account
    // without prompting, so the page came up connected to a wallet the visitor
    // never chose here; connecting is now always an explicit act.
    const onAccounts = (accounts: unknown) =>
      setAccount((accounts as Address[])[0]);
    injected.on?.("accountsChanged", onAccounts);
    return () => {
      injected.removeListener?.("accountsChanged", onAccounts);
    };
  }, []);

  const connect = useCallback(async () => {
    if (!provider) {
      return;
    }
    setError(undefined);
    setConnecting(true);
    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as Address[];
      setAccount(accounts[0]);
    } catch (err) {
      setError(message(err));
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  // Drops this page's handle on the account. The wallet keeps the site
  // authorised - only the wallet itself can revoke that.
  const disconnect = useCallback(() => {
    setAccount(undefined);
    setError(undefined);
  }, []);

  return {
    provider,
    account,
    connecting,
    error,
    hasWallet: provider !== undefined,
    connect,
    disconnect,
  };
}

export function publicClient(provider: EIP1193Provider) {
  return createPublicClient({ chain, transport: custom(provider) });
}

export function walletClient(provider: EIP1193Provider, account: Address) {
  return createWalletClient({ account, chain, transport: custom(provider) });
}
