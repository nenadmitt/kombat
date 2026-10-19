import { getDefaultConfig } from "connectkit";
import { createConfig, http } from "wagmi";
import { defineChain } from "viem";

import { CHAIN_ID, CHAIN_NAME, EXPLORER_URL, IS_TESTNET } from "./chain";

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  testnet: IS_TESTNET,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
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
    // Without a project id WalletConnect is dead but injected wallets still work.
    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
    ssr: true,
  }),
);
