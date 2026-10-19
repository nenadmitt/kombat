import { getDefaultConfig } from 'connectkit';
import { defineChain } from 'viem';
import { createConfig, http } from 'wagmi';

import { CHAIN_ID, CHAIN_NAME, EXPLORER_URL, IS_TESTNET, RPC_URL } from './chain';
import { env } from './env';

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  testnet: IS_TESTNET,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Explorer', url: EXPLORER_URL } },
});

export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: 'Kombat',
    appDescription: 'Realtime mini-games with on-chain stakes.',
    appUrl: 'https://playkombat.xyz',
    appIcon: '/app-icon.svg',
    chains: [chain],
    transports: { [chain.id]: http() },
    // A mobile browser has no injected provider, so WalletConnect is the only connector there.
    walletConnectProjectId: env.walletConnectProjectId,
  }),
);
