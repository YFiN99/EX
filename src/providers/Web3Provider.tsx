import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";

// Ambil RPC dari environment variable (paling aman untuk production)
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://rpc-testnet.celeschain.xyz/";

const celesChain = {
  id: 22225,
  name: "CelesChain Testnet",
  nativeCurrency: {
    name: "Celes",
    symbol: "CLES",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
    // Bisa ditambah websocket kalau dibutuhkan
    // public: { http: [RPC_URL], webSocket: ["wss://rpc-testnet.celeschain.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "CelesChain Testnet Explorer",
      url: "https://testnet-explorer.celeschain.xyz/",
    },
  },
  // Optional: tambahkan testnet flag kalau Wagmi butuh
  testnet: true,
};

// WalletConnect Project ID (wajib diisi kalau mau support wallet mobile)
const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || "";

const config = createConfig(
  getDefaultConfig({
    chains: [celesChain],
    walletConnectProjectId: projectId,
    appName: "CEX Staking", // atau nama app kamu
    // Penting: definisikan transport secara eksplisit
    transports: {
      [celesChain.id]: http(RPC_URL),
    },
  })
);

const queryClient = new QueryClient();

export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="auto" // atau custom theme kalau ada
          options={{
            // Optional: hide some wallets kalau tidak relevan
            // walletDisplay: "show-all",
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
