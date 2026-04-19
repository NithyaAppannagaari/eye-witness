"use client";

import { useConnection, useConnect, useDisconnect, useChainId, useSwitchChain, useConnectors } from "wagmi";
import { sepolia } from "wagmi/chains";

export function ConnectButton() {
  const { address, isConnected } = useConnection();
  const { mutate: connect, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const chainId = useChainId();
  const { mutate: switchChain, isPending: isSwitching } = useSwitchChain();
  const connectors = useConnectors();

  if (isConnected && address) {
    if (chainId !== sepolia.id) {
      return (
        <button
          onClick={() => switchChain({ chainId: sepolia.id })}
          disabled={isSwitching}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-colors"
        >
          {isSwitching ? "Switching…" : "Switch to Sepolia"}
        </button>
      );
    }

    return (
      <button
        onClick={() => disconnect()}
        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
