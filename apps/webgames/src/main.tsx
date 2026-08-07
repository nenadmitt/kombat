import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, SIWEProvider } from 'connectkit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';

import { App } from './App';
import { siweConfig } from './lib/siwe';
import { wagmiConfig } from './lib/wagmi';
import './styles.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SIWEProvider {...siweConfig}>
          <ConnectKitProvider theme="midnight" options={{ enforceSupportedChains: true }}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ConnectKitProvider>
        </SIWEProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
