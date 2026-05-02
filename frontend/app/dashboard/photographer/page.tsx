"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useConnection, useReadContract, useWatchContractEvent } from "wagmi";
import { useState, useEffect, useMemo } from "react";
import { formatUnits } from "viem";
import PhotoRegistryABI from "@/abi/PhotoRegistry.json";
import MockUSDCABI from "@/abi/MockUSDC.json";
import { agentApi, type PhotoSummary, type LedgerEntry, type DetectionRow, type AgentStatus, type RequeueResult } from "@/lib/agent-api";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS as `0x${string}` | undefined;
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined;

type Tab = "photos" | "detections" | "disputes" | "targets";

function StatusPill({ status }: { status: string }) {
  if (status === "paid") return <Pill label="PAID" tone="emerald" />;
  if (status === "paying") return <Pill label="PAYING…" tone="amber" />;
  if (status === "dmca_sent") return <Pill label="DMCA SENT" tone="orange" />;
  if (status === "verified") return <Pill label="VERIFIED" tone="sky" />;
  if (status === "matched") return <Pill label="MATCHED" tone="amber" />;
  if (status === "already_licensed") return <Pill label="ALREADY LICENSED" tone="emerald" />;
  if (status === "unverifiable") return <Pill label="UNVERIFIABLE" tone="zinc" />;
  return <Pill label={status.toUpperCase()} tone="zinc" />;
}

function Pill({ label, tone }: { label: string; tone: "emerald" | "amber" | "orange" | "sky" | "zinc" }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-500/[0.1] border-emerald-500/20 text-emerald-400",
    amber: "bg-amber-500/[0.1] border-amber-500/20 text-amber-400",
    orange: "bg-orange-500/[0.1] border-orange-500/20 text-orange-400",
    sky: "bg-sky-500/[0.1] border-sky-500/20 text-sky-400",
    zinc: "bg-zinc-500/[0.1] border-zinc-500/20 text-zinc-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {label}
    </span>
  );
}

export default function PhotographerDashboard() {
  const { address, isConnected } = useConnection();
  const [tab, setTab] = useState<Tab>("photos");
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [detections, setDetections] = useState<DetectionRow[]>([]);
  const [disputes, setDisputes] = useState<DetectionRow[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [newTarget, setNewTarget] = useState("");
  const [targetError, setTargetError] = useState("");
  const [agentOnline, setAgentOnline] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [retryState, setRetryState] = useState<Record<number, "loading" | RequeueResult>>({});

  // On-chain USDC balance for the connected wallet — this is the photographer's
  // *actual* earnings, read directly from the chain. Source of truth, no agent
  // indexer required. Refreshes every 15s and on any new chain block.
  const { data: walletUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI.abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!USDC_ADDRESS && !!address, refetchInterval: 15_000 },
  });
  const walletUsdcBalance = walletUsdc ? BigInt(walletUsdc as bigint) : 0n;

  // Primary photo source: agent's /api/photos (joins registered_photos with ledger aggregates).
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await agentApi.photosByOwner(address);
        if (!cancelled) { setPhotos(rows); setPhotosError(null); }
      } catch (err) {
        if (!cancelled) setPhotosError(err instanceof Error ? err.message : "Failed to load photos from agent");
      }
    };
    load();
    const interval = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  // Live updates: optimistically add new registrations as they happen on-chain.
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
          timestamp: (log.args.timestamp as bigint).toString(),
          pHash: null,
          grossEarned: "0",
          photographerEarned: "0",
          detectionCount: 0,
        }));
      setPhotos((prev) => {
        const existing = new Set(prev.map((p) => p.photoHash.toLowerCase()));
        return [...prev, ...incoming.filter((p) => !existing.has(p.photoHash.toLowerCase()))];
      });
    },
    enabled: !!CONTRACT_ADDRESS && isConnected,
  });

  // Ledger (photographer view) — drives the "earnings" surface.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await agentApi.ledgerByPhotographer(address);
        if (!cancelled) setLedger(rows);
      } catch { /* surfaced indirectly via agent-online indicator */ }
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  // Full detection history (paid + DMCA + matched + verified + already_licensed).
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await agentApi.detections(address);
        if (!cancelled) setDetections(rows);
      } catch { /* agent offline */ }
    };
    load();
    const interval = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  // Disputes only (DMCA-sent rows).
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await agentApi.disputes(address);
        if (!cancelled) setDisputes(rows);
      } catch { /* silent */ }
    };
    load();
    const interval = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  // Agent health via /api/targets.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const t = await agentApi.targets();
        if (!cancelled) { setAgentOnline(true); setTargets(t); }
      } catch {
        if (!cancelled) setAgentOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Agent indexing lag — used to surface "still catching up" instead of an empty list.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const s = await agentApi.status();
        if (!cancelled) setAgentStatus(s);
      } catch {
        if (!cancelled) setAgentStatus(null);
      }
    };
    check();
    const interval = setInterval(check, 20_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Reset on wallet change.
  useEffect(() => {
    setPhotos([]);
    setLedger([]);
    setDetections([]);
    setDisputes([]);
    setPhotosError(null);
  }, [address]);

  const totalEarnedRaw = useMemo(
    () => ledger.reduce((acc, e) => acc + BigInt(e.amount), 0n),
    [ledger]
  );
  const photographerEarned = (totalEarnedRaw * 8500n) / 10_000n;

  const addTarget = async () => {
    setTargetError("");
    const url = newTarget.trim();
    if (!url) return;
    const data = await agentApi.addTarget(url);
    if (!data.ok) { setTargetError(data.error ?? "Failed to add target"); return; }
    setTargets(data.targets ?? []);
    setNewTarget("");
  };

  const removeTarget = async (url: string) => {
    const data = await agentApi.removeTarget(url);
    if (data.ok) setTargets(data.targets ?? []);
  };

  const retryPayment = async (id: number) => {
    setRetryState((s) => ({ ...s, [id]: "loading" }));
    const result = await agentApi.requeueDetection(id);
    setRetryState((s) => ({ ...s, [id]: result }));
    if (result.ok && address) {
      // Optimistically remove from disputes; the next poll will reconcile.
      setDisputes((prev) => prev.filter((d) => d.id !== id));
      try {
        const [d, l] = await Promise.all([
          agentApi.detections(address),
          agentApi.ledgerByPhotographer(address),
        ]);
        setDetections(d);
        setLedger(l);
      } catch { /* polls will catch up */ }
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0806]">
      <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#0a0806]/88 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight text-[#f5f0eb]">
          Eye<span className="text-orange-500">:</span>Witness
        </Link>
        <ConnectButton />
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-12">
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
            <div className="grid grid-cols-4 gap-4 mb-7">
              <StatCard label="Photos Registered" value={photos.length} />
              <StatCard label="Detections" value={detections.length} />
              <StatCard label="Wallet USDC" value={`$${formatUnits(walletUsdcBalance, 6)}`} highlight />
              <StatCard label="Pending DMCA" value={disputes.length} />
            </div>

            <IndexingBanner status={agentStatus} photosError={photosError} />

            <div className="flex gap-1 mb-5 border-b border-white/[0.07]">
              <TabButton active={tab === "photos"} onClick={() => setTab("photos")}>
                Registered Photos
              </TabButton>
              <TabButton active={tab === "detections"} onClick={() => setTab("detections")}>
                Detection History
                {detections.length > 0 && (
                  <span className="ml-2 rounded-full bg-white/[0.06] border border-white/[0.1] px-1.5 py-0.5 text-xs font-medium text-[#a89f96]">
                    {detections.length}
                  </span>
                )}
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
              photos.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
                  <p className="text-[#a89f96] text-sm">No photos registered yet.</p>
                  <p className="text-[#6b6259] text-xs mt-1">Register a photo and it will appear here within a few seconds.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {photos.map((p) => {
                    const earned = BigInt(p.photographerEarned);
                    return (
                      <Link
                        key={p.photoHash}
                        href={`/photo/${p.photoHash}`}
                        className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-5 hover:border-orange-500/[0.2] transition-colors block"
                      >
                        <div className="font-mono text-[10px] text-[#6b6259] truncate mb-2">{p.photoHash}</div>
                        <div className="text-xs text-[#6b6259] mb-3">
                          Registered {new Date(Number(p.timestamp) * 1000).toLocaleDateString()}
                        </div>
                        <div className="flex items-baseline justify-between">
                          <div>
                            <div className="text-[10px] text-[#6b6259] uppercase tracking-widest">Earned</div>
                            <div className="text-xl font-bold text-orange-400 tabular-nums">${formatUnits(earned, 6)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-[#6b6259] uppercase tracking-widest">Detections</div>
                            <div className="text-xl font-bold text-[#f5f0eb] tabular-nums">{p.detectionCount}</div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )
            )}

            {tab === "detections" && (
              <DetectionsTable detections={detections} ledger={ledger} />
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Sent To</th>
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
                          <td className="px-4 py-3 text-xs text-[#6b6259] truncate max-w-[200px]">{d.dmcaEmail ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-[#6b6259]">
                            {d.dmcaSentAt ? new Date(d.dmcaSentAt).toLocaleDateString() : new Date(d.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <RetryPaymentCell state={retryState[d.id]} onRetry={() => retryPayment(d.id)} />
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

function DetectionsTable({ detections, ledger }: { detections: DetectionRow[]; ledger: LedgerEntry[] }) {
  // Index ledger by (photoId, pageUrl) so each detection row can show its actual on-chain
  // payout (the canonical truth), not just whatever licensePrice the DB cached.
  const ledgerKey = (photoId: string, pageUrl: string) => `${photoId.toLowerCase()}|${pageUrl}`;
  const byKey = new Map<string, LedgerEntry>();
  for (const e of ledger) byKey.set(ledgerKey(e.photoId, e.pageUrl), e);

  if (detections.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
        <p className="text-[#a89f96] text-sm">No detections yet.</p>
        <p className="text-[#6b6259] text-xs mt-1">When the agent finds one of your photos on a crawl target, it will appear here.</p>
      </div>
    );
  }

  // Newest first
  const sorted = [...detections].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[#0a0806] border-b border-white/[0.07]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">When</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Photo</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Found On</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Use</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-[#6b6259] uppercase tracking-wider">Earned (85%)</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[#6b6259] uppercase tracking-wider">Tx</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => {
            const ledgerHit = d.matchedPhotoHash ? byKey.get(ledgerKey(d.matchedPhotoHash, d.pageUrl)) : undefined;
            const earned = ledgerHit ? (BigInt(ledgerHit.amount) * 8500n) / 10_000n : 0n;
            const tx = ledgerHit?.txHash ?? d.txHash ?? null;
            return (
              <tr key={d.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 text-xs text-[#6b6259] whitespace-nowrap">
                  {new Date(d.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-[#a89f96]">
                  {d.matchedPhotoHash ? `${d.matchedPhotoHash.slice(0, 10)}…` : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-[#a89f96] max-w-xs truncate">
                  <a href={d.pageUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#f5f0eb]">{d.pageUrl}</a>
                </td>
                <td className="px-4 py-3 text-xs text-[#a89f96] capitalize">{d.useType ?? "—"}</td>
                <td className="px-4 py-3"><StatusPill status={d.status} /></td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[#f5f0eb] tabular-nums">
                  {ledgerHit ? `+$${formatUnits(earned, 6)}` : <span className="text-[#3a3530]">—</span>}
                </td>
                <td className="px-4 py-3">
                  {tx ? (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${tx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-orange-400/60 hover:text-orange-400 transition-colors"
                    >
                      View ↗
                    </a>
                  ) : <span className="text-xs text-[#3a3530]">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IndexingBanner({ status, photosError }: { status: AgentStatus | null; photosError: string | null }) {
  if (photosError) {
    return (
      <div className="mb-5 rounded-xl border border-amber-500/[0.2] bg-amber-500/[0.05] px-4 py-3 text-xs text-amber-300">
        <p>Agent API: {photosError}</p>
        <p className="text-amber-400/60 mt-1">Make sure the agent is running on localhost:3001.</p>
      </div>
    );
  }
  if (!status) return null;

  const registryLag = status.registry.lag ?? 0;
  const ledgerLag = status.ledger.lag ?? 0;
  const maxLag = Math.max(registryLag, ledgerLag);

  // ~5 blocks/tick at 60s ticks is steady-state; show only when meaningfully behind.
  if (maxLag <= 10) return null;

  const ticksRemaining = Math.ceil(maxLag / 9);
  const minutes = Math.ceil((ticksRemaining * 60) / 60);

  return (
    <div className="mb-5 rounded-xl border border-amber-500/[0.2] bg-amber-500/[0.05] px-4 py-3 text-xs text-amber-300">
      <p>
        Agent is indexing — {maxLag} blocks behind chain head. Recent photos and payments may not appear yet.
      </p>
      <p className="text-amber-400/60 mt-1">
        Estimated catch-up: ~{minutes} minute{minutes === 1 ? "" : "s"} at the current rate-limited pace
        {". "}Set <span className="font-mono">REGISTRY_DEPLOY_BLOCK</span> and <span className="font-mono">ESCROW_DEPLOY_BLOCK</span> in <span className="font-mono">.env</span> to skip ahead, or upgrade RPC tier and bump <span className="font-mono">RPC_MAX_PER_TICK</span>.
      </p>
    </div>
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

function RetryPaymentCell({ state, onRetry }: { state: "loading" | RequeueResult | undefined; onRetry: () => void }) {
  if (state === "loading") {
    return <span className="text-xs text-amber-400">Paying…</span>;
  }
  if (state && state.ok) {
    const amount = state.amount ? `+$${formatUnits(BigInt(state.amount), 6)}` : "Paid";
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs text-emerald-400">{amount} paid</span>
        {state.txHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${state.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-emerald-400/60 hover:text-emerald-400 transition-colors"
          >
            View tx ↗
          </a>
        )}
      </div>
    );
  }
  if (state && !state.ok) {
    const detail = state.balance && state.required
      ? `escrow $${formatUnits(BigInt(state.balance), 6)} < $${formatUnits(BigInt(state.required), 6)}`
      : state.error;
    return (
      <div className="flex flex-col items-start gap-0.5 max-w-[220px]">
        <button
          onClick={onRetry}
          className="text-xs text-orange-400/80 hover:text-orange-400 transition-colors"
        >
          Retry payment →
        </button>
        <span className="text-[10px] text-red-400/80 truncate w-full" title={detail}>{detail}</span>
      </div>
    );
  }
  return (
    <button
      onClick={onRetry}
      className="text-xs text-orange-400/60 hover:text-orange-400 transition-colors"
    >
      Retry payment →
    </button>
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
