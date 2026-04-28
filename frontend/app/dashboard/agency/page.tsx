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

  useEffect(() => {
    if (!address) return;
    const stored = localStorage.getItem(`portfolio:${address}`) ?? "[]";
    setPortfolio(JSON.parse(stored) as string[]);
  }, [address]);

  const savePortfolio = (updated: string[]) => {
    if (address) localStorage.setItem(`portfolio:${address}`, JSON.stringify(updated));
    setPortfolio(updated);
  };

  const { data: stakeBalance, refetch: refetchStake } = useReadContract({
    address: VAULT_ADDRESS,
    abi: EscrowVaultABI.abi,
    functionName: "agencyStakes",
    args: [address!],
    query: { enabled: !!VAULT_ADDRESS && !!address, refetchInterval: 15_000 },
  });

  const { data: walletUsdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI.abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!USDC_ADDRESS && !!address, refetchInterval: 15_000 },
  });

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
    <main className="min-h-screen bg-[#0a0806]">
      <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#0a0806]/88 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight text-[#f5f0eb]">
          Eye<span className="text-orange-500">:</span>Witness
        </Link>
        <ConnectButton />
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-12 space-y-6">
        <h1 className="text-2xl font-bold text-[#f5f0eb] tracking-tight">Agency Dashboard</h1>

        {!isConnected ? (
          <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
            <p className="text-[#a89f96] mb-5">Connect your wallet to manage your agency.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Wallet USDC" value={`$${formatUnits(walletBalance, 6)}`} />
              <StatCard label="Agency Stake" value={`$${formatUnits(stake_, 6)}`} highlight />
              <StatCard label="Licenses (session)" value={earnings.length} />
            </div>

            {/* Stake */}
            <section className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6">
              <h2 className="font-semibold text-[#f5f0eb] mb-1">Stake USDC</h2>
              <p className="text-sm text-[#6b6259] mb-4">
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
                  className="flex-1 rounded-lg border border-white/[0.1] bg-[#0a0806] px-3 py-2 text-sm text-[#f5f0eb] placeholder-[#6b6259] focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/40"
                />
                <button
                  disabled={!stakeAmount || isStaking}
                  onClick={() => stake(stakeAmount)}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
                >
                  {stakeStep === "approving" ? "Approving…" : stakeStep === "staking" ? "Staking…" : "Stake"}
                </button>
              </div>
              {stakeError && <p className="mt-2 text-sm text-red-400">{stakeError.message}</p>}
            </section>

            {/* Portfolio */}
            <section className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6">
              <h2 className="font-semibold text-[#f5f0eb] mb-1">Portfolio</h2>
              <p className="text-sm text-[#6b6259] mb-4">Add photographer wallet addresses to track earnings across their photos.</p>
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  placeholder="0x photographer wallet"
                  value={newPhotographer}
                  onChange={(e) => setNewPhotographer(e.target.value)}
                  className="flex-1 rounded-lg border border-white/[0.1] bg-[#0a0806] px-3 py-2 text-sm font-mono text-[#f5f0eb] placeholder-[#6b6259] focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/40"
                />
                <button
                  disabled={!newPhotographer}
                  onClick={addPhotographer}
                  className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#f5f0eb] hover:bg-white/[0.08] disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>
              {portfolio.length === 0 ? (
                <p className="text-sm text-[#6b6259]">No photographers in portfolio yet.</p>
              ) : (
                <ul className="space-y-2">
                  {portfolio.map((w) => (
                    <li key={w} className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#0a0806] px-3 py-2.5">
                      <span className="font-mono text-xs text-[#a89f96]">{w}</span>
                      <button
                        onClick={() => savePortfolio(portfolio.filter((x) => x !== w))}
                        className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Earnings */}
            <section className="rounded-xl border border-white/[0.08] bg-[#0d0b08] overflow-hidden">
              <div className="px-6 py-4 border-b border-white/[0.07]">
                <h2 className="font-semibold text-[#f5f0eb]">License Earnings</h2>
                <p className="text-xs text-[#6b6259] mt-0.5">All LicenseMinted events in this session</p>
              </div>
              {earnings.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-[#6b6259]">
                  No earnings yet this session.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[#0a0806] border-b border-white/[0.07]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">URL</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Use Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.map((e, i) => (
                      <tr key={i} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-xs text-[#a89f96] truncate max-w-xs">
                          <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#f5f0eb] transition-colors">{e.url}</a>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-emerald-500/[0.1] border border-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">{e.useType}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6b6259]">
                          {new Date(Number(e.timestamp) * 1000).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {e.txHash && (
                            <a
                              href={`https://sepolia.etherscan.io/tx/${e.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-orange-400/60 hover:text-orange-400 transition-colors"
                            >
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
    <div className={`rounded-xl border px-5 py-5 ${highlight ? "border-orange-500/[0.25] bg-orange-500/[0.06]" : "border-white/[0.08] bg-[#0d0b08]"}`}>
      <p className="text-[11px] text-[#6b6259] uppercase tracking-widest">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${highlight ? "text-orange-400" : "text-[#f5f0eb]"}`}>{value}</p>
    </div>
  );
}
