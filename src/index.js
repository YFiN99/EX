import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, getDefaultConfig } from 'connectkit';

import './index.css';
import App from './App';

const chainId = Number(process.env.REACT_APP_CHAIN_ID) || 22225;
const rpcUrl = process.env.REACT_APP_RPC_URL || 'https://rpc-testnet.celeschain.xyz/';
const walletConnectProjectId = process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || "3fcc6b4468bd930c973549527613737f";

const celesChain = {
  id: chainId,
  name: 'CelesChain',
  nativeCurrency: { name: 'Celes', symbol: 'CLES', decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
    public: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'CelesScan', url: 'https://explorer-testnet.celeschain.xyz' },
  },
};

const config = createConfig(
  getDefaultConfig({
    appName: 'CelesChain DEX',
    walletConnectProjectId,
    chains: [celesChain, mainnet],
    ssr: false,
    
    // INI KUNCINYA: Memaksa WalletConnect agar tidak memanggil Family SDK secara otomatis
    walletConnectOptions: {
      showQrModal: true,
    },
    
    transports: {
      [celesChain.id]: http(rpcUrl),
      [mainnet.id]: http(),
    },
  })
);

const queryClient = new QueryClient();
const rootElement = document.getElementById('root');

if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ConnectKitProvider 
            mode="dark"
            options={{
              initialChainId: chainId,
              // Matikan fitur-fitur extra yang mungkin memicu Family SDK
              embedGoogleFonts: false, 
            }}
          >
            <App />
          </ConnectKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </StrictMode>
  );
}