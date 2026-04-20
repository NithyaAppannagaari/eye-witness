"use client";

import { useConnection, useConnect, useDisconnect, useChainId, useSwitchChain, useConnectors } from "wagmi";
import { bscTestnet } from "wagmi/chains";

export function ConnectButton() {
  const { address, isConnected } = useConnection();
  const { mutate: connect, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const chainId = useChainId();
  const { mutate: switchChain, isPending: isSwitching } = useSwitchChain();
  const connectors = useConnectors();

  if (isConnected && address) {
    if (chainId !== bscTestnet.id) {
      return (
        <button
          onClick={() => switchChain({ chainId: bscTestnet.id })}
          disabled={isSwitching}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-colors"
        >
          {isSwitching ? "Switching…" : "Switch to BNB Testnet"}
        </button>
      );
    }

    return (
      <button
        onClick={() => disconnect()}
        className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-sm font-medium text-[#f5f0eb] hover:bg-white/[0.08] transition-colors"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  const injected = connectors[0];

  return (
    <button
      onClick={() => connect({ connector: injected })}
      disabled={isPending}
      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
