import { createConfig, http, injected } from "wagmi";
import { bscTestnet } from "wagmi/chains";

const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;

export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  transports: { [bscTestnet.id]: http(rpcUrl) },
  ssr: true,
});

// Keep fallbackConfig as an alias so existing imports don't break
export const fallbackConfig = wagmiConfig;
