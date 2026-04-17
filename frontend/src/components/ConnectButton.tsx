"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
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
