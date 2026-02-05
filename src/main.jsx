import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains"; 
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";

import './index.css';
import App from './App.jsx';

// 1. Definisikan CelesChain agar sistem mengenalinya 📡
const celesChain = {
  id: 22225,
  name: 'CelesChain',
  nativeCurrency: { 
    name: 'Celes', 
    symbol: 'CLES', 
    decimals: 18 
  },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL || 'https://rpc-testnet.celeschain.xyz/'] },
  },
  blockExplorers: {
    default: { name: 'CelesScan', url: 'https://testnet-explorer.celeschain.xyz' },
  },
};

// 2. Masukkan celesChain ke dalam daftar chains ⚙️
const config = createConfig(
  getDefaultConfig({
    appName: "CelesChain DEX",
    chains: [celesChain, mainnet], // celesChain sekarang ada di sini!
    walletConnectProjectId: "DAPATKAN_DI_WALLETCONNECT_CLOUD",
  }),
);

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider shadow={true}>
          <App />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);