import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider, createConfig } from "wagmi";
import { mainnet } from "wagmi/chains"; 
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";

import './index.css'; // Pastikan file ini ada meskipun kosong
import App from './App.jsx';

// 1. Definisikan CelesChain 📡
const celesChain = {
  id: Number(import.meta.env.VITE_CHAIN_ID) || 22225,
  name: 'CelesChain',
  nativeCurrency: { 
    name: 'Celes', 
    symbol: import.meta.env.VITE_SYMBOL || 'CLES', 
    decimals: 18 
  },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL || 'https://rpc-testnet.celeschain.xyz/'] },
  },
  blockExplorers: {
    default: { name: 'CelesScan', url: 'https://testnet-explorer.celeschain.xyz' },
  },
};

// 2. Konfigurasi (Menggunakan Project ID dari .env) ⚙️
const config = createConfig(
  getDefaultConfig({
    appName: "CelesChain DEX",
    chains: [celesChain, mainnet],
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "",
  }),
);

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* Shadow true membantu isolasi CSS agar tidak bentrok */}
        <ConnectKitProvider mode="dark">
          <App />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
