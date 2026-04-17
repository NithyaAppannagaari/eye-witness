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
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <Link href="/" className="font-bold text-lg tracking-tight">Eye:Witness</Link>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-12 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Photo Provenance</h1>

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <Row label="Owner" value={
            <span className="font-mono text-sm break-all">{p.owner}</span>
          } />
          <Row label="Registered" value={
            <span>{date.toUTCString()}</span>
          } />
          <Row label="Metadata hash" value={
            <span className="font-mono text-xs break-all text-gray-600">{p.metadataHash}</span>
          } />
          <Row label="Photo hash" value={
            <span className="font-mono text-xs break-all text-gray-600">{photoHash}</span>
          } />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">License Rules</h2>
          <Row label="Editorial" value={`${formatUnits(p.licenseRules.editorialPrice, 6)} USDC`} />
          <Row label="Commercial" value={`${formatUnits(p.licenseRules.commercialPrice, 6)} USDC`} />
          <Row
            label="AI Training"
            value={
              p.licenseRules.blockAiTraining
                ? <span className="text-red-600 font-medium">Blocked</span>
                : `${formatUnits(p.licenseRules.aiTrainingPrice, 6)} USDC`
            }
          />
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
          Want to license this photo?{" "}
          <Link href="/publisher" className="underline font-medium">
            Deposit escrow to license automatically →
          </Link>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
      <span className="w-32 shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Loading provenance record…</p>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="text-gray-700">{message}</p>
        <Link href="/register" className="text-blue-600 underline text-sm">Register a photo →</Link>
      </div>
    </main>
  );
}
