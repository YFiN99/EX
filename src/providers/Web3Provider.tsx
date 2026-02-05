import { WagmiProvider, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import React from "react";

// 1. Definisikan CelesChain dari Environment Variable 🛰️
const celesChain = {
  id: Number(import.meta.env.VITE_CHAIN_ID) || 22225,
  name: "CelesChain",
  nativeCurrency: { 
    name: "Celes", 
    symbol: import.meta.env.VITE_SYMBOL || "CLES", 
    decimals: 18 
  },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL || "https://rpc-testnet.celeschain.xyz/"] },
  },
  blockExplorers: {
    default: { name: "CelesScan", url: "https://explorer.celes.network" },
  },
} as const;

// 2. Buat Konfigurasi dengan Project ID dari .env ⚙️
const config = createConfig(
  getDefaultConfig({
    chains: [celesChain],
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "",
    appName: "CEX Staking",
  })
);

const queryClient = new QueryClient();

// 3. Provider Component 📦
export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
