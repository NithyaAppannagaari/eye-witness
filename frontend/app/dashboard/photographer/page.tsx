"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useConnection, useWatchContractEvent, usePublicClient } from "wagmi";
import { useState, useEffect } from "react";
import { formatUnits, parseAbiItem } from "viem";
import PhotoRegistryABI from "@/abi/PhotoRegistry.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS as `0x${string}` | undefined;
const DEPLOY_BLOCK = process.env.NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK
  ? BigInt(process.env.NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK)
  : 0n;
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
  matchedPhotoHash: string | null;
  status: string;
  useType: string | null;
  licensePrice: string | null;
  txHash: string | null;
}

interface Dispute {
  id: number;
  pageUrl: string;
  imageUrl: string;
  useType: string | null;
  status: string;
  dmcaSentAt: string | null;
  createdAt: string;
  dmcaEmail: string | null;
}

type Tab = "photos" | "disputes" | "targets";

function statusBadge(status: string) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/[0.1] border border-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
        PAID
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
  const publicClient = usePublicClient();
  const [tab, setTab] = useState<Tab>("photos");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [usdcEarned, setUsdcEarned] = useState(0n);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [newTarget, setNewTarget] = useState("");
  const [targetError, setTargetError] = useState("");
  const [agentOnline, setAgentOnline] = useState(false);

  // Fetch historical PhotoRegistered events on mount — live watcher alone loses data on navigation.
  useEffect(() => {
    if (!address || !CONTRACT_ADDRESS || !publicClient) return;
    let cancelled = false;
    const fetchHistorical = async () => {
      try {
        // Use deploy block if set; otherwise fall back to recent 100k blocks to stay within Alchemy's range limit.
        const fromBlock = DEPLOY_BLOCK > 0n
          ? DEPLOY_BLOCK
          : (await publicClient.getBlockNumber()) - 100_000n;
        const logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: parseAbiItem("event PhotoRegistered(bytes32 indexed photoHash, address indexed owner, uint256 timestamp)"),
          args: { owner: address },
          fromBlock,
          toBlock: "latest",
        });
        if (cancelled) return;
        setRegistrations(
          logs.map((log) => ({
            photoHash: log.args.photoHash as string,
            owner: log.args.owner as string,
            timestamp: log.args.timestamp as bigint,
            txHash: log.transactionHash ?? undefined,
          }))
        );
      } catch (err) {
        console.warn("[dashboard] Failed to fetch historical registrations:", err);
      }
    };
    fetchHistorical();
    return () => { cancelled = true; };
  }, [address, publicClient]);

  // Watch for new registrations while the page is open.
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: PhotoRegistryABI.abi,
    eventName: "PhotoRegistered",
    onLogs(logs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const incoming = (logs as any[])
        .filter((log) => log.args?.owner?.toLowerCase() === address?.toLowerCase())
        .map((log) => ({
          photoHash: log.args.photoHash as string,
          owner: log.args.owner as string,
          timestamp: log.args.timestamp as bigint,
          txHash: (log.transactionHash as string) ?? undefined,
        }));
      setRegistrations((prev) => {
        const existing = new Set(prev.map((r) => r.photoHash));
        return [...prev, ...incoming.filter((r) => !existing.has(r.photoHash))];
      });
    },
    enabled: !!CONTRACT_ADDRESS && isConnected,
  });

  // Load detections from agent API, poll every 30s.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${AGENT_API}/api/detections?wallet=${address.toLowerCase()}`);
        if (!res.ok || cancelled) return;
        const rows = await res.json() as Detection[];
        if (!cancelled) {
          setDetections(rows);
          const paid = rows.filter((r) => r.status === "paid" && r.licensePrice);
          const total = paid.reduce((acc, r) => acc + BigInt(r.licensePrice!), 0n);
          setUsdcEarned((total * 8500n) / 10_000n);
        }
      } catch { /* agent offline — targets poll handles the indicator */ }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  // Load disputes from agent API, poll every 30s.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${AGENT_API}/api/disputes?wallet=${address.toLowerCase()}`);
        if (!res.ok || cancelled) return;
        const rows = await res.json() as Dispute[];
        if (!cancelled) setDisputes(rows);
      } catch { /* agent not running — silent */ }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  // Poll agent health via /api/targets — works without wallet connection.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${AGENT_API}/api/targets`);
        if (cancelled) return;
        if (res.ok) {
          setAgentOnline(true);
          setTargets(await res.json() as string[]);
        } else {
          setAgentOnline(false);
        }
      } catch {
        if (!cancelled) setAgentOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    setRegistrations([]);
    setUsdcEarned(0n);
    setDetections([]);
    setDisputes([]);
  }, [address]);

  const addTarget = async () => {
    setTargetError("");
    const url = newTarget.trim();
    if (!url) return;
    try {
      const res = await fetch(`${AGENT_API}/api/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json() as { ok?: boolean; targets?: string[]; error?: string };
      if (!res.ok) { setTargetError(data.error ?? "Failed to add target"); return; }
      setTargets(data.targets ?? []);
      setNewTarget("");
    } catch {
      setTargetError("Agent is not running — start the agent first");
    }
  };

  const removeTarget = async (url: string) => {
    try {
      const res = await fetch(`${AGENT_API}/api/targets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json() as { targets?: string[] };
      if (res.ok) setTargets(data.targets ?? []);
    } catch { /* agent offline */ }
  };

  // Count detections per photo from agent API data.
  const detectionsByPhoto = new Map<string, number>();
  for (const d of detections) {
    if (d.matchedPhotoHash && (d.status === "paid" || d.status === "dmca_sent")) {
      const key = d.matchedPhotoHash.toLowerCase();
      detectionsByPhoto.set(key, (detectionsByPhoto.get(key) ?? 0) + 1);
    }
  }

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
          <div>
            <h1 className="text-2xl font-bold text-[#f5f0eb] tracking-tight">Photographer Dashboard</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${agentOnline ? "bg-emerald-500" : "bg-[#3a3530]"}`} />
              <span className="text-xs text-[#6b6259]">{agentOnline ? "Agent online" : "Agent offline"}</span>
            </div>
          </div>
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
              <StatCard label="Detections" value={detections.length} />
            </div>

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
              <TabButton active={tab === "targets"} onClick={() => setTab("targets")}>
                Crawl Targets
                <span className="ml-2 rounded-full bg-white/[0.06] border border-white/[0.1] px-1.5 py-0.5 text-xs font-medium text-[#6b6259]">
                  {targets.length}
                </span>
              </TabButton>
            </div>

            {tab === "photos" && (
              registrations.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
                  <p className="text-[#a89f96] text-sm">No photos registered yet.</p>
                  <p className="text-[#6b6259] text-xs mt-1">Register a photo and it will appear here.</p>
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
                                Etherscan ↗
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
                  <p className="text-[#6b6259] text-xs mt-1">Disputes appear here when the agent detects unlicensed usage with no publisher escrow.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0a0806] border-b border-white/[0.07]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Infringing URL</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Use Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {disputes.map((d) => (
                        <tr key={d.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-xs text-[#a89f96] max-w-xs truncate">
                            <a href={d.pageUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#f5f0eb] transition-colors">
                              {d.pageUrl}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#a89f96] capitalize">{d.useType ?? "—"}</td>
                          <td className="px-4 py-3">{statusBadge(d.status)}</td>
                          <td className="px-4 py-3 text-xs text-[#6b6259]">
                            {d.dmcaSentAt
                              ? new Date(d.dmcaSentAt).toLocaleDateString()
                              : new Date(d.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={async () => {
                                await fetch(`${AGENT_API}/api/detections/${d.id}/requeue`, { method: "POST" });
                              }}
                              className="text-xs text-orange-400/60 hover:text-orange-400 transition-colors"
                            >
                              Retry payment →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === "targets" && (
              <div className="space-y-4">
                <section className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6">
                  <h2 className="font-semibold text-[#f5f0eb] mb-1">Add Crawl Target</h2>
                  <p className="text-sm text-[#6b6259] mb-4">
                    URLs the agent will check on every 60-second tick. Add any page or direct image URL where you suspect your photo is being used.
                  </p>
                  <div className="flex gap-3">
                    <input
                      type="url"
                      placeholder="https://example.com/article-with-your-photo"
                      value={newTarget}
                      onChange={(e) => { setNewTarget(e.target.value); setTargetError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") addTarget(); }}
                      className="flex-1 rounded-lg border border-white/[0.1] bg-[#0a0806] px-3 py-2 text-sm text-[#f5f0eb] placeholder-[#6b6259] focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/40"
                    />
                    <button
                      disabled={!newTarget.trim()}
                      onClick={addTarget}
                      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {targetError && <p className="mt-2 text-sm text-red-400">{targetError}</p>}
                </section>

                {targets.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
                    <p className="text-[#a89f96] text-sm">No targets yet.</p>
                    <p className="text-[#6b6259] text-xs mt-1">Add a URL above and the agent will start checking it on the next tick.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] overflow-hidden">
                    <div className="px-6 py-3 border-b border-white/[0.07] flex items-center justify-between">
                      <span className="text-xs text-[#6b6259]">{targets.length} URL{targets.length !== 1 ? "s" : ""} — checked every 60 seconds</span>
                    </div>
                    <ul className="divide-y divide-white/[0.05]">
                      {targets.map((url) => (
                        <li key={url} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500/60 shrink-0" />
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-xs text-[#a89f96] font-mono truncate hover:text-[#f5f0eb] transition-colors"
                          >
                            {url}
                          </a>
                          <button
                            onClick={() => removeTarget(url)}
                            className="text-xs text-[#3a3530] hover:text-red-400 transition-colors shrink-0"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
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
