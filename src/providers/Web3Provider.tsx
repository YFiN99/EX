import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import React from "react";

// 1. Fallbacks
const DEFAULT_CHAIN_ID = 22225;
const DEFAULT_RPC = "https://rpc-testnet.celeschain.xyz/";
const DEFAULT_MULTICALL = "0xc9c4B7DF500336A24F46671287Ccde5A674A3FB2";

// Menggunakan process.env karena lo bukan pakai Vite
const celesChain = {
  id: Number(process.env.REACT_APP_CHAIN_ID) || DEFAULT_CHAIN_ID,
  name: "CelesChain",
  nativeCurrency: { 
    name: "Celes", 
    symbol: process.env.REACT_APP_SYMBOL || "CLES", 
    decimals: 18 
  },
  rpcUrls: {
    default: { http: [process.env.REACT_APP_RPC_URL || DEFAULT_RPC] },
    public: { http: [process.env.REACT_APP_RPC_URL || DEFAULT_RPC] },
  },
  blockExplorers: {
    default: { name: "CelesScan", url: "https://explorer-testnet.celeschain.xyz" },
  },
  contracts: {
    multicall3: {
      address: process.env.REACT_APP_MULTICALL_ADDRESS || DEFAULT_MULTICALL,
    },
  },
};

// 2. Konfigurasi Wagmi
const config = createConfig(
  getDefaultConfig({
    chains: [celesChain],
    // Project ID dari WalletConnect Cloud (Wajib di .env)
    walletConnectProjectId: process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || "3fcc6b4468bd930c973549527613737f", 
    appName: "CEX Staking",
    appDescription: "DEX and Staking Platform on CelesChain",
    ssr: false, // Set false karena CRA biasanya murni Client Side
    transports: {
      [celesChain.id]: http(process.env.REACT_APP_RPC_URL || DEFAULT_RPC),
    },
  })
);

const queryClient = new QueryClient();

export const Web3Provider = ({ children }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider 
          mode="dark" 
          options={{
            initialChainId: DEFAULT_CHAIN_ID,
            showBalance: true,
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};