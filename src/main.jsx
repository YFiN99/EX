import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider, createConfig, http } from "wagmi"; // Pastikan http diimport
import { mainnet } from "wagmi/chains"; 
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";

import './index.css';
import App from './App.jsx';

// 1. Definisikan Chain
const celesChain = {
  id: Number(import.meta.env.VITE_CHAIN_ID) || 22225,
  name: 'CelesChain',
  nativeCurrency: { name: 'Celes', symbol: 'CLES', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL || 'https://rpc-testnet.celeschain.xyz/'] },
  },
  blockExplorers: {
    default: { name: 'CelesScan', url: 'https://testnet-explorer.celeschain.xyz' },
  },
};

// 2. Buat Config (Versi Wagmi v2)
const config = createConfig(
  getDefaultConfig({
    appName: "CelesChain DEX",
    chains: [celesChain, mainnet],
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "",
    // Tambahkan transports di bawah ini 👇
    transports: {
      [celesChain.id]: http(),
      [mainnet.id]: http(),
    },
  }),
);

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider mode="dark">
          <App />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);