"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";
import { useConnection } from "wagmi";
import { PhotoUpload, PhotoData } from "@/components/PhotoUpload";
import { LicenseRulesForm } from "@/components/LicenseRulesForm";
import { LicenseRules, useRegisterPhoto } from "@/hooks/useRegisterPhoto";

export default function RegisterPage() {
  const router = useRouter();
  const { address, isConnected } = useConnection();
  const { register, isPending, isConfirming, isSuccess, txHash, error } = useRegisterPhoto();

  const [photoData, setPhotoData] = useState<PhotoData | null>(null);
  const [rules, setRules] = useState<LicenseRules>({
    editorialPrice: "",
    commercialPrice: "",
    aiTrainingPrice: "",
    blockAiTraining: false,
  });

  if (isSuccess && photoData) {
    router.push(`/photo/${photoData.imageHash}`);
  }

  const canSubmit = isConnected && photoData && !isPending && !isConfirming;

  return (
    <main className="min-h-screen bg-[#0a0806]">
      <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#0a0806]/88 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight text-[#f5f0eb]">
          Eye<span className="text-orange-500">:</span>Witness
        </Link>
        <ConnectButton />
      </nav>

      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-2xl font-bold text-[#f5f0eb] mb-2 tracking-tight">Register a Photo</h1>
        <p className="text-sm text-[#6b6259] mb-8">
          Commit a timestamped, GPS-verified provenance record on Sepolia.
        </p>

        {!isConnected ? (
          <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
            <p className="text-[#a89f96] mb-5">Connect your wallet to register a photo.</p>
            <ConnectButton />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6">
              <h2 className="font-semibold text-[#f5f0eb] mb-4">1. Upload Photo</h2>
              <PhotoUpload walletAddress={address!} onPhotoReady={setPhotoData} />

              {photoData && (
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-400 space-y-1">
                  <p><span className="font-medium text-emerald-300">Timestamp:</span> {photoData.timestamp}</p>
                  <p><span className="font-medium text-emerald-300">GPS:</span> {photoData.lat.toFixed(5)}, {photoData.lng.toFixed(5)}</p>
                  <p className="font-mono text-xs truncate">
                    <span className="font-medium not-italic text-emerald-300">Image hash:</span> {photoData.imageHash}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6">
              <h2 className="font-semibold text-[#f5f0eb] mb-4">2. Set License Rules</h2>
              <LicenseRulesForm rules={rules} onChange={setRules} />
            </section>

            <button
              disabled={!canSubmit}
              onClick={() => {
                if (photoData) register(photoData.imageHash, photoData.metadataHash, rules);
              }}
              className="w-full rounded-xl bg-orange-500 px-4 py-3.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(249,115,22,0.3)]"
            >
              {isPending
                ? "Waiting for wallet…"
                : isConfirming
                ? "Confirming on-chain…"
                : "Register Photo"}
            </button>

            {txHash && (
              <p className="text-sm text-[#6b6259] text-center">
                Tx:{" "}
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-400 underline font-mono hover:text-orange-300 transition-colors"
                >
                  {txHash.slice(0, 10)}…{txHash.slice(-8)}
                </a>
              </p>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400">
                {error.message}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
