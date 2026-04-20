"use client";

import { use } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import PhotoRegistryABI from "@/abi/PhotoRegistry.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS as `0x${string}` | undefined;

export default function ProvenancePage({
  params,
}: {
  params: Promise<{ photoHash: string }>;
}) {
  const { photoHash } = use(params);

  const { data: photo, isLoading, error } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: PhotoRegistryABI.abi,
    functionName: "getPhoto",
    args: [photoHash as `0x${string}`],
    query: { enabled: !!CONTRACT_ADDRESS && !!photoHash },
  });

  if (!CONTRACT_ADDRESS) {
    return <ErrorState message="Contract not deployed yet — NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS is not set." />;
  }

  if (isLoading) return <LoadingState />;

  if (error || !photo) {
    return <ErrorState message="Photo not found. This hash may not be registered." />;
  }

  const p = photo as {
    metadataHash: string;
    owner: string;
    timestamp: bigint;
    licenseRules: {
      editorialPrice: bigint;
      commercialPrice: bigint;
      aiTrainingPrice: bigint;
      blockAiTraining: boolean;
    };
  };

  const date = new Date(Number(p.timestamp) * 1000);

  return (
    <main className="min-h-screen bg-[#0a0806]">
      <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#0a0806]/88 backdrop-blur-md px-6 py-4">
        <Link href="/" className="font-bold text-lg tracking-tight text-[#f5f0eb]">
          Eye<span className="text-orange-500">:</span>Witness
        </Link>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-12 space-y-6">
        <div>
          <div className="inline-block text-[11px] font-semibold text-orange-400 tracking-widest uppercase bg-orange-500/[0.08] border border-orange-500/[0.18] rounded-full px-3 py-1 mb-3">
            On-Chain Provenance
          </div>
          <h1 className="text-2xl font-bold text-[#f5f0eb] tracking-tight">Photo Provenance</h1>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6 space-y-4">
          <Row label="Owner" value={
            <span className="font-mono text-sm break-all text-[#f5f0eb]">{p.owner}</span>
          } />
          <Row label="Registered" value={
            <span className="text-[#f5f0eb]">{date.toUTCString()}</span>
          } />
          <Row label="Metadata hash" value={
            <span className="font-mono text-xs break-all text-[#a89f96]">{p.metadataHash}</span>
          } />
          <Row label="Photo hash" value={
            <span className="font-mono text-xs break-all text-[#a89f96]">{photoHash}</span>
          } />
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6 space-y-4">
          <h2 className="font-semibold text-[#f5f0eb]">License Rules</h2>
          <Row label="Editorial" value={<span className="text-[#f5f0eb]">{formatUnits(p.licenseRules.editorialPrice, 6)} USDC</span>} />
          <Row label="Commercial" value={<span className="text-[#f5f0eb]">{formatUnits(p.licenseRules.commercialPrice, 6)} USDC</span>} />
          <Row
            label="AI Training"
            value={
              p.licenseRules.blockAiTraining
                ? <span className="text-red-400 font-medium">Blocked</span>
                : <span className="text-[#f5f0eb]">{formatUnits(p.licenseRules.aiTrainingPrice, 6)} USDC</span>
            }
          />
        </div>

        <div className="rounded-xl border border-orange-500/[0.18] bg-orange-500/[0.05] p-4 text-sm text-orange-300">
          Want to license this photo?{" "}
          <Link href="/publisher" className="underline font-medium text-orange-400 hover:text-orange-300 transition-colors">
            Deposit escrow to license automatically →
          </Link>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
      <span className="w-32 shrink-0 text-sm text-[#6b6259]">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-[#0a0806] flex items-center justify-center">
      <p className="text-[#6b6259]">Loading provenance record…</p>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-[#0a0806] flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-[#a89f96]">{message}</p>
        <Link href="/register" className="text-orange-400 hover:text-orange-300 underline text-sm transition-colors">
          Register a photo →
        </Link>
      </div>
    </main>
  );
}
