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
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        RESOLVED
      </span>
    );
  }
  if (status === "dmca_sent") {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
        DMCA SENT
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
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

  // Watch PhotoRegistered events
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

  // Watch LicenseMinted events — accumulate USDC earned for this photographer's photos
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

  // Fetch detections from agent API
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

  // Fetch disputes from agent API (polls every 30s)
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
            <div className="grid grid-cols-3 gap-4 mb-8">
              <StatCard label="Photos Registered" value={registrations.length} />
              <StatCard label="USDC Earned" value={`$${formatUnits(usdcEarned, 6)}`} />
              <StatCard label="Detections" value={totalDetections} />
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              <TabButton active={tab === "photos"} onClick={() => setTab("photos")}>
                Registered Photos
              </TabButton>
              <TabButton active={tab === "disputes"} onClick={() => setTab("disputes")}>
                Disputes
                {disputes.length > 0 && (
                  <span className="ml-2 rounded-full bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
                    {disputes.length}
                  </span>
                )}
              </TabButton>
            </div>

            {tab === "photos" && (
              registrations.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
                  <p className="text-gray-500 text-sm">No photos registered yet, or events occurred before this session.</p>
                  <p className="text-gray-400 text-xs mt-1">Register a photo and it will appear here in real time.</p>
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
                          <td className="px-4 py-3 text-gray-700 text-xs">
                            {detectionsByPhoto.get(r.photoHash.toLowerCase()) ?? 0}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/photo/${r.photoHash}`} className="text-blue-600 hover:underline text-xs">
                              View provenance →
                            </Link>
                            {r.txHash && (
                              <a
                                href={`https://sepolia.etherscan.io/tx/${r.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-3 text-gray-400 hover:text-gray-600 text-xs"
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
                <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
                  <p className="text-gray-500 text-sm">No enforcement actions yet.</p>
                  <p className="text-gray-400 text-xs mt-1">Disputes appear here when the agent detects unlicensed usage that can&apos;t be auto-paid.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Infringing URL</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Use Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dispute #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {disputes.map((d) => (
                        <tr key={d.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs text-gray-700 max-w-xs truncate">
                            <a
                              href={d.pageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {d.pageUrl}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 capitalize">
                            {d.useType ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-600">
                            {d.disputeId != null ? `#${d.disputeId}` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {disputeStatusBadge(d.status)}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {d.dmcaSentAt
                              ? new Date(d.dmcaSentAt).toLocaleDateString()
                              : new Date(d.createdAt).toLocaleDateString()}
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
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
