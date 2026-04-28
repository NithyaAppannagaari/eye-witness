"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useConnection, useWatchContractEvent } from "wagmi";
import { useState, useEffect } from "react";
import { formatUnits } from "viem";
import PhotoRegistryABI from "@/abi/PhotoRegistry.json";
import LicenseEngineABI from "@/abi/LicenseEngine.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS as `0x${string}` | undefined;
const LICENSE_ENGINE_ADDRESS = process.env.NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS as `0x${string}` | undefined;
const AGENT_API = "http://localhost:3001";

interface Registration {
  photoHash: string;
  owner: string;
  timestamp: bigint;
  txHash?: string;
}

interface Detection {
  id: number;
  pageUrl: string;
  imageUrl: string;
  status: string;
  useType: string | null;
  licensePrice: string | null;
  txHash: string | null;
}

interface Dispute {
  id: number;
  pageUrl: string;
  imageUrl: string;
  matchedPhotoHash: string | null;
  useType: string | null;
  disputeId: number | null;
  status: string;
  dmcaSentAt: string | null;
  resolvedAt: string | null;
  dmcaEmail: string | null;
  createdAt: string;
}

type Tab = "photos" | "disputes";

function disputeStatusBadge(status: string) {
  if (status === "resolved") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/[0.1] border border-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
        RESOLVED
      </span>
    );
  }
  if (status === "dmca_sent") {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-500/[0.1] border border-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
        DMCA SENT
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/[0.1] border border-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
      OPEN
    </span>
  );
}

export default function PhotographerDashboard() {
  const { address, isConnected } = useConnection();
  const [tab, setTab] = useState<Tab>("photos");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [usdcEarned, setUsdcEarned] = useState(0n);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [detectionsByPhoto, setDetectionsByPhoto] = useState<Map<string, number>>(new Map());

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
        return [...prev, ...relevant.filter((r) => !existing.has(r.photoHash))];
      });
    },
    enabled: !!CONTRACT_ADDRESS && isConnected,
  });

  useWatchContractEvent({
    address: LICENSE_ENGINE_ADDRESS,
    abi: LicenseEngineABI.abi,
    eventName: "LicenseMinted",
    onLogs(logs) {
      const myHashes = new Set(registrations.map((r) => r.photoHash.toLowerCase()));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (logs as any[]).forEach((log) => {
        const photoId = (log.args?.photoId as string)?.toLowerCase();
        if (myHashes.has(photoId)) {
          setDetectionsByPhoto((prev) => {
            const updated = new Map(prev);
            updated.set(photoId, (updated.get(photoId) ?? 0) + 1);
            return updated;
          });
        }
      });
    },
    enabled: !!LICENSE_ENGINE_ADDRESS && isConnected && registrations.length > 0,
  });

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${AGENT_API}/api/detections?wallet=${address.toLowerCase()}`);
        if (!res.ok || cancelled) return;
        const rows = await res.json() as Detection[];
        if (!cancelled) setDetections(rows);

        const paid = rows.filter((r) => r.status === "paid" && r.licensePrice);
        const total = paid.reduce((acc, r) => acc + BigInt(r.licensePrice!), 0n);
        if (!cancelled) setUsdcEarned((total * 8000n) / 10000n);
      } catch {
        // Agent API not running — silently skip
      }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${AGENT_API}/api/disputes?wallet=${address.toLowerCase()}`);
        if (!res.ok || cancelled) return;
        const rows = await res.json() as Dispute[];
        if (!cancelled) setDisputes(rows);
      } catch {
        // Agent API not running — silently skip
      }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  useEffect(() => {
    setRegistrations([]);
    setUsdcEarned(0n);
    setDetections([]);
    setDisputes([]);
    setDetectionsByPhoto(new Map());
  }, [address]);

  const totalDetections = detections.length;

  return (
    <main className="min-h-screen bg-[#0a0806]">
      <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#0a0806]/88 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight text-[#f5f0eb]">
          Eye<span className="text-orange-500">:</span>Witness
        </Link>
        <ConnectButton />
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-[#f5f0eb] tracking-tight">Photographer Dashboard</h1>
          <Link
            href="/register"
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            + Register Photo
          </Link>
        </div>

        {!isConnected ? (
          <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
            <p className="text-[#a89f96] mb-5">Connect your wallet to view your photos.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-7">
              <StatCard label="Photos Registered" value={registrations.length} />
              <StatCard label="USDC Earned" value={`$${formatUnits(usdcEarned, 6)}`} />
              <StatCard label="Detections" value={totalDetections} />
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-5 border-b border-white/[0.07]">
              <TabButton active={tab === "photos"} onClick={() => setTab("photos")}>
                Registered Photos
              </TabButton>
              <TabButton active={tab === "disputes"} onClick={() => setTab("disputes")}>
                Disputes
                {disputes.length > 0 && (
                  <span className="ml-2 rounded-full bg-orange-500/[0.15] border border-orange-500/20 px-1.5 py-0.5 text-xs font-medium text-orange-400">
                    {disputes.length}
                  </span>
                )}
              </TabButton>
            </div>

            {tab === "photos" && (
              registrations.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
                  <p className="text-[#a89f96] text-sm">No photos registered yet, or events occurred before this session.</p>
                  <p className="text-[#6b6259] text-xs mt-1">Register a photo and it will appear here in real time.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0a0806] border-b border-white/[0.07]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Photo Hash</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Registered</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Detections</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.map((r) => (
                        <tr key={r.photoHash} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-[#a89f96] truncate max-w-xs">
                            {r.photoHash.slice(0, 18)}…
                          </td>
                          <td className="px-4 py-3 text-[#a89f96] text-xs">
                            {new Date(Number(r.timestamp) * 1000).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-[#a89f96] text-xs">
                            {detectionsByPhoto.get(r.photoHash.toLowerCase()) ?? 0}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/photo/${r.photoHash}`} className="text-orange-400 hover:text-orange-300 text-xs transition-colors">
                              View provenance →
                            </Link>
                            {r.txHash && (
                              <a
                                href={`https://sepolia.etherscan.io/tx/${r.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-3 text-orange-400/50 hover:text-orange-400 text-xs transition-colors"
                              >
                                BscScan ↗
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === "disputes" && (
              disputes.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
                  <p className="text-[#a89f96] text-sm">No enforcement actions yet.</p>
                  <p className="text-[#6b6259] text-xs mt-1">Disputes appear here when the agent detects unlicensed usage that can&apos;t be auto-paid.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0a0806] border-b border-white/[0.07]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Infringing URL</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Use Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Dispute #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {disputes.map((d) => (
                        <tr key={d.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-xs text-[#a89f96] max-w-xs truncate">
                            <a
                              href={d.pageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-[#f5f0eb] transition-colors"
                            >
                              {d.pageUrl}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#a89f96] capitalize">
                            {d.useType ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-[#a89f96]">
                            {d.disputeId != null ? `#${d.disputeId}` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {disputeStatusBadge(d.status)}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#6b6259]">
                            {d.dmcaSentAt
                              ? new Date(d.dmcaSentAt).toLocaleDateString()
                              : new Date(d.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            {d.status !== "resolved" && (
                              <button
                                onClick={async () => {
                                  await fetch(`${AGENT_API}/api/detections/${d.id}/requeue`, { method: "POST" });
                                }}
                                className="text-xs text-orange-400/60 hover:text-orange-400 transition-colors"
                              >
                                Retry payment →
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-5 py-5">
      <p className="text-[11px] text-[#6b6259] uppercase tracking-widest">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-[#f5f0eb]">{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-orange-500 text-orange-400"
          : "border-transparent text-[#6b6259] hover:text-[#a89f96]"
      }`}
    >
      {children}
    </button>
  );
}
