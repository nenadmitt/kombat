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

import { CHAIN_ID, CHAIN_ID_HEX, EXPLORER_URL } from "./chain";

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
  chainId: number | undefined;
  connecting: boolean;
  error: string | undefined;
  hasWallet: boolean;
  wrongNetwork: boolean;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
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
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const injected = window.ethereum;
    if (!injected) {
      return;
    }
    setProvider(injected);

    // Reconnect silently: eth_accounts returns the already-authorised account
    // without prompting, so a reload does not ask again.
    void injected
      .request({ method: "eth_accounts" })
      .then((accounts) => setAccount((accounts as Address[])[0]))
      .catch(() => undefined);
    void injected
      .request({ method: "eth_chainId" })
      .then((id) => setChainId(Number(id)))
      .catch(() => undefined);

    const onAccounts = (accounts: unknown) =>
      setAccount((accounts as Address[])[0]);
    const onChain = (id: unknown) => setChainId(Number(id));
    injected.on?.("accountsChanged", onAccounts);
    injected.on?.("chainChanged", onChain);
    return () => {
      injected.removeListener?.("accountsChanged", onAccounts);
      injected.removeListener?.("chainChanged", onChain);
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
      const id = await provider.request({ method: "eth_chainId" });
      setChainId(Number(id));
    } catch (err) {
      setError(message(err));
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const switchNetwork = useCallback(async () => {
    if (!provider) {
      return;
    }
    setError(undefined);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (err) {
      // 4902: the wallet does not know this chain yet, so offer to add it.
      if ((err as { code?: number }).code !== 4902) {
        setError(message(err));
        return;
      }
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: chain.rpcUrls.default.http,
              blockExplorerUrls: [EXPLORER_URL],
            },
          ],
        });
      } catch (addErr) {
        setError(message(addErr));
      }
    }
  }, [provider]);

  return {
    provider,
    account,
    chainId,
    connecting,
    error,
    hasWallet: provider !== undefined,
    wrongNetwork: chainId !== undefined && chainId !== CHAIN_ID,
    connect,
    switchNetwork,
  };
}

export function publicClient(provider: EIP1193Provider) {
  return createPublicClient({ chain, transport: custom(provider) });
}

export function walletClient(provider: EIP1193Provider, account: Address) {
  return createWalletClient({ account, chain, transport: custom(provider) });
}
