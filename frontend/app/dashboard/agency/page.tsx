"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useConnection, useReadContract, useWatchContractEvent } from "wagmi";
import { formatUnits } from "viem";
import { useAgencyStaking } from "@/hooks/useAgencyStaking";
import EscrowVaultABI from "@/abi/EscrowVault.json";
import LicenseEngineABI from "@/abi/LicenseEngine.json";
import MockUSDCABI from "@/abi/MockUSDC.json";

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS as `0x${string}` | undefined;
const LICENSE_ENGINE_ADDRESS = process.env.NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS as `0x${string}` | undefined;
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined;

interface LicenseEarning {
  url: string;
  photoId: string;
  useType: string;
  timestamp: bigint;
  txHash?: string;
}

export default function AgencyDashboard() {
  const { address, isConnected } = useConnection();
  const [stakeAmount, setStakeAmount] = useState("");
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [newPhotographer, setNewPhotographer] = useState("");
  const [earnings, setEarnings] = useState<LicenseEarning[]>([]);

  const { stake, step: stakeStep, isPending: isStaking, error: stakeError, reset: resetStake } = useAgencyStaking();

  // Load portfolio from localStorage
  useEffect(() => {
    if (!address) return;
    const stored = localStorage.getItem(`portfolio:${address}`) ?? "[]";
    setPortfolio(JSON.parse(stored) as string[]);
  }, [address]);

  const savePortfolio = (updated: string[]) => {
    if (address) localStorage.setItem(`portfolio:${address}`, JSON.stringify(updated));
    setPortfolio(updated);
  };

  // Read agency stake
  const { data: stakeBalance, refetch: refetchStake } = useReadContract({
    address: VAULT_ADDRESS,
    abi: EscrowVaultABI.abi,
    functionName: "agencyStakes",
    args: [address!],
    query: { enabled: !!VAULT_ADDRESS && !!address, refetchInterval: 15_000 },
  });

  // Read USDC wallet balance
  const { data: walletUsdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI.abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!USDC_ADDRESS && !!address, refetchInterval: 15_000 },
  });

  // Watch LicenseMinted — collect events for portfolio photos
  useWatchContractEvent({
    address: LICENSE_ENGINE_ADDRESS,
    abi: LicenseEngineABI.abi,
    eventName: "LicenseMinted",
    onLogs(logs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const relevant = (logs as any[]).map((l) => ({
        url: l.args.url as string,
        photoId: l.args.photoId as string,
        useType: l.args.useType as string,
        timestamp: l.args.timestamp as bigint,
        txHash: l.transactionHash as string,
      }));
      if (relevant.length > 0) {
        setEarnings((prev) => {
          const existing = new Set(prev.map((e) => e.txHash));
          return [...prev, ...relevant.filter((e) => !existing.has(e.txHash))];
        });
        refetchStake();
      }
    },
    enabled: !!LICENSE_ENGINE_ADDRESS && isConnected,
  });

  useEffect(() => { resetStake(); }, [address]);
  if (stakeStep === "done") { refetchStake(); resetStake(); }

  const stake_ = stakeBalance ? BigInt(stakeBalance as bigint) : 0n;
  const walletBalance = walletUsdcBalance ? BigInt(walletUsdcBalance as bigint) : 0n;

  const addPhotographer = () => {
    const addr = newPhotographer.trim().toLowerCase();
    if (!addr || portfolio.includes(addr)) return;
    savePortfolio([...portfolio, addr]);
    setNewPhotographer("");
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight">Eye:Witness</Link>
        <ConnectButton />
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Agency Dashboard</h1>

        {!isConnected ? (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
            <p className="text-gray-600 mb-4">Connect your wallet to manage your agency.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Wallet USDC" value={`$${formatUnits(walletBalance, 6)}`} />
              <StatCard label="Agency Stake" value={`$${formatUnits(stake_, 6)}`} highlight />
              <StatCard label="Licenses (session)" value={earnings.length} />
            </div>

            {/* Stake */}
            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="font-semibold text-gray-900 mb-1">Stake USDC</h2>
              <p className="text-sm text-gray-500 mb-4">
                Your stake backs the agent. The agent routes its fee cut back to replenish your stake automatically.
              </p>
              <div className="flex gap-3">
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Amount (USDC)"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  disabled={!stakeAmount || isStaking}
                  onClick={() => stake(stakeAmount)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {stakeStep === "approving" ? "Approving…" : stakeStep === "staking" ? "Staking…" : "Stake"}
                </button>
              </div>
              {stakeError && <p className="mt-2 text-sm text-red-600">{stakeError.message}</p>}
            </section>

            {/* Portfolio */}
            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="font-semibold text-gray-900 mb-1">Portfolio</h2>
              <p className="text-sm text-gray-500 mb-4">Add photographer wallet addresses to track earnings across their photos.</p>
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  placeholder="0x photographer wallet"
                  value={newPhotographer}
                  onChange={(e) => setNewPhotographer(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  disabled={!newPhotographer}
                  onClick={addPhotographer}
                  className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>
              {portfolio.length === 0 ? (
                <p className="text-sm text-gray-400">No photographers in portfolio yet.</p>
              ) : (
                <ul className="space-y-2">
                  {portfolio.map((w) => (
                    <li key={w} className="flex items-center justify-between rounded bg-gray-50 px-3 py-2">
                      <span className="font-mono text-xs text-gray-600">{w}</span>
                      <button
                        onClick={() => savePortfolio(portfolio.filter((x) => x !== w))}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Earnings */}
            <section className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">License Earnings</h2>
                <p className="text-xs text-gray-500 mt-0.5">All LicenseMinted events in this session</p>
              </div>
              {earnings.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-gray-400">
                  No earnings yet this session.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Use Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tx</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {earnings.map((e, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-600 truncate max-w-xs">
                          <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{e.url}</a>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">{e.useType}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(Number(e.timestamp) * 1000).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {e.txHash && (
                            <a href={`https://sepolia.etherscan.io/tx/${e.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                              View ↗
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-5 ${highlight ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${highlight ? "text-blue-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
