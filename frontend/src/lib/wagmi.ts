import { createConfig, http, injected } from "wagmi";
import { sepolia } from "wagmi/chains";

const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(rpcUrl) },
  ssr: true,
});

// Keep fallbackConfig as an alias so existing imports don't break
export const fallbackConfig = wagmiConfig;
