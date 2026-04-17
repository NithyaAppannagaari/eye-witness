"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useAccount, useReadContracts } from "wagmi";
import { useWatchContractEvent } from "wagmi";
import { useState, useEffect } from "react";
import { formatUnits } from "viem";
import PhotoRegistryABI from "@/abi/PhotoRegistry.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS as `0x${string}` | undefined;

interface Registration {
  photoHash: string;
  owner: string;
  timestamp: bigint;
  txHash?: string;
}

export default function PhotographerDashboard() {
  const { address, isConnected } = useAccount();
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  // Watch for PhotoRegistered events and filter by connected wallet
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: PhotoRegistryABI.abi,
    eventName: "PhotoRegistered",
    onLogs(logs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const relevant = (logs as any[])
        .filter((log) => log.args?.owner?.toLowerCase() === address?.toLowerCase())
        .map((log) => ({
          photoHash: log.args.photoHash as string,
          owner: log.args.owner as string,
          timestamp: log.args.timestamp as bigint,
          txHash: (log.transactionHash as string) ?? undefined,
        }));

      setRegistrations((prev) => {
        const existing = new Set(prev.map((r) => r.photoHash));
        const newOnes = relevant.filter((r) => !existing.has(r.photoHash));
        return [...prev, ...newOnes];
      });
    },
    enabled: !!CONTRACT_ADDRESS && isConnected,
  });

  // Clear registrations when wallet changes
  useEffect(() => {
    setRegistrations([]);
  }, [address]);

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight">Eye:Witness</Link>
        <ConnectButton />
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Photographer Dashboard</h1>
          <Link
            href="/register"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            + Register Photo
          </Link>
        </div>

        {!isConnected ? (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
            <p className="text-gray-600 mb-4">Connect your wallet to view your photos.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <StatCard label="Photos Registered" value={registrations.length} />
              <StatCard label="USDC Earned" value="— (Phase 3)" muted />
              <StatCard label="Open Disputes" value="— (Phase 4)" muted />
            </div>

            {/* Registrations table */}
            {registrations.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
                <p className="text-gray-500 text-sm">
                  No photos registered yet, or events occurred before this session.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Register a photo and it will appear here in real time.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Photo Hash</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detections</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {registrations.map((r) => (
                      <tr key={r.photoHash} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate max-w-xs">
                          {r.photoHash.slice(0, 18)}…
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {new Date(Number(r.timestamp) * 1000).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">— (Phase 2)</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/photo/${r.photoHash}`}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            View provenance →
                          </Link>
                          {r.txHash && (
                            <a
                              href={`https://sepolia.etherscan.io/tx/${r.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-3 text-gray-400 hover:text-gray-600 text-xs"
                            >
                              Basescan ↗
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  muted,
}: {
  label: string;
  value: string | number;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${muted ? "text-gray-300" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}
