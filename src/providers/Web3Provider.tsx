import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";

// 1. Definisikan CelesChain 🛰️
const celesChain = {
  id: 22225,
  name: "CelesChain",
  nativeCurrency: { name: "Celes", symbol: "CLES", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.celes.network"] },
  },
  blockExplorers: {
    default: { name: "CelesScan", url: "https://explorer.celes.network" },
  },
};

// 2. Buat Konfigurasi ⚙️
const config = createConfig(
  getDefaultConfig({
    chains: [celesChain],
    walletConnectProjectId: "", // Bisa diisi nanti
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
