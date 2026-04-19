"use client";

import { useState } from "react";
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
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-lg tracking-tight">Eye:Witness</span>
        <ConnectButton />
      </nav>

      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Register a Photo</h1>
        <p className="text-sm text-gray-500 mb-8">
          Commit a timestamped, GPS-verified provenance record on BNB Testnet.
        </p>

        {!isConnected ? (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
            <p className="text-gray-600 mb-4">Connect your wallet to register a photo.</p>
            <ConnectButton />
          </div>
        ) : (
          <div className="space-y-8">
            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="font-semibold text-gray-900 mb-4">1. Upload Photo</h2>
              <PhotoUpload walletAddress={address!} onPhotoReady={setPhotoData} />

              {photoData && (
                <div className="mt-4 rounded bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 space-y-1">
                  <p><span className="font-medium">Timestamp:</span> {photoData.timestamp}</p>
                  <p><span className="font-medium">GPS:</span> {photoData.lat.toFixed(5)}, {photoData.lng.toFixed(5)}</p>
                  <p className="font-mono text-xs truncate">
                    <span className="font-medium not-italic">Image hash:</span> {photoData.imageHash}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="font-semibold text-gray-900 mb-4">2. Set License Rules</h2>
              <LicenseRulesForm rules={rules} onChange={setRules} />
            </section>

            <button
              disabled={!canSubmit}
              onClick={() => {
                if (photoData) register(photoData.imageHash, photoData.metadataHash, rules);
              }}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending
                ? "Waiting for wallet…"
                : isConfirming
                ? "Confirming on-chain…"
                : "Register Photo"}
            </button>

            {txHash && (
              <p className="text-sm text-gray-500 text-center">
                Tx:{" "}
                <a
                  href={`https://testnet.bscscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline font-mono"
                >
                  {txHash.slice(0, 10)}…{txHash.slice(-8)}
                </a>
              </p>
            )}

            {error && (
              <div className="rounded bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error.message}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
