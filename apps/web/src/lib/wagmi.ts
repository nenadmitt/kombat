import { getDefaultConfig } from "connectkit";
import { createConfig, http } from "wagmi";
import { defineChain } from "viem";

import { CHAIN_ID, EXPLORER_URL } from "./chain";

export const chain = defineChain({
  id: CHAIN_ID,
  name: "Ethereum Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] },
  },
  blockExplorers: { default: { name: "Etherscan", url: EXPLORER_URL } },
});

export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: "Kombat",
    chains: [chain],
    transports: { [chain.id]: http() },
    // Without a project id the WalletConnect option is dead but injected
    // wallets still work - fine for the closed test.
    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
    ssr: true,
  }),
);
