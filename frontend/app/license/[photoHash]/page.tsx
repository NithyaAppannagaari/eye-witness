"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useConnection, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import PhotoRegistryABI from "@/abi/PhotoRegistry.json";
import MockUSDCABI from "@/abi/MockUSDC.json";

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS as `0x${string}` | undefined;
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined;

type UseType = "editorial" | "commercial" | "ai_training";

const USE_LABELS: Record<UseType, string> = {
  editorial: "Editorial",
  commercial: "Commercial",
  ai_training: "AI Training",
};

export default function LicensePage({
  params,
  searchParams,
}: {
  params: Promise<{ photoHash: string }>;
  searchParams: Promise<{ url?: string; use?: string }>;
}) {
  const { photoHash } = use(params);
  const { url: infringingUrl, use: useHint } = use(searchParams);

  const { address, isConnected } = useConnection();
  const [useType, setUseType] = useState<UseType>(
    (useHint as UseType) ?? "editorial"
  );
  const [licenseUrl, setLicenseUrl] = useState(infringingUrl ?? "");
  const [step, setStep] = useState<"idle" | "approving" | "paying" | "recording" | "done">("idle");
  const [error, setError] = useState("");

  const { data: photo, isLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: PhotoRegistryABI.abi,
    functionName: "getPhoto",
    args: [photoHash as `0x${string}`],
    query: { enabled: !!REGISTRY_ADDRESS && !!photoHash },
  });

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (txConfirmed && step === "paying") {
      recordLicense();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txConfirmed]);

  if (!REGISTRY_ADDRESS || !USDC_ADDRESS) {
    return <ErrorState message="Contract addresses not configured." />;
  }
  if (isLoading) return <LoadingState />;
  if (!photo) return <ErrorState message="Photo not found. This hash may not be registered on-chain." />;

  const p = photo as {
    owner: string;
    timestamp: bigint;
    licenseRules: {
      editorialPrice: bigint;
      commercialPrice: bigint;
      aiTrainingPrice: bigint;
      blockAiTraining: boolean;
    };
  };

  const priceMap: Record<UseType, bigint> = {
    editorial: p.licenseRules.editorialPrice,
    commercial: p.licenseRules.commercialPrice,
    ai_training: p.licenseRules.aiTrainingPrice,
  };
  const price = priceMap[useType];
  const isBlocked = useType === "ai_training" && p.licenseRules.blockAiTraining;

  async function recordLicense() {
    setStep("recording");
    try {
      await writeContractAsync({
        address: REGISTRY_ADDRESS!,
        abi: PhotoRegistryABI.abi,
        functionName: "recordLicense",
        args: [photoHash as `0x${string}`, licenseUrl],
      });
      setStep("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to record license on-chain: ${msg}`);
      setStep("idle");
    }
  }

  async function handlePay() {
    if (!address || !price || isBlocked) return;
    setError("");
    setStep("approving");
    try {
      // Direct USDC transfer from publisher to photographer
      const hash = await writeContractAsync({
        address: USDC_ADDRESS!,
        abi: MockUSDCABI.abi,
        functionName: "transfer",
        args: [p.owner, price],
      });
      setTxHash(hash);
      setStep("paying");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("user rejected") ? "Transaction rejected." : `Payment failed: ${msg}`);
      setStep("idle");
    }
  }

  if (step === "done") {
    return (
      <PageShell>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-6 py-10 text-center">
          <p className="text-2xl font-bold text-emerald-400 mb-2">License Paid</p>
          <p className="text-sm text-[#a89f96]">
            Payment sent to the photographer. The DMCA notice for this URL has been resolved.
          </p>
          <p className="text-xs text-[#6b6259] mt-4 font-mono break-all">{licenseUrl || "—"}</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-bold text-[#f5f0eb] mb-1 tracking-tight">Pay for a License</h1>
      <p className="text-sm text-[#6b6259] mb-8">
        You received a DMCA takedown notice for using this photo. Pay the license fee to resolve it — the notice is withdrawn automatically.
      </p>

      <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6 mb-5 space-y-3">
        <Row label="Photo Hash" value={`${photoHash.slice(0, 20)}…`} mono />
        <Row label="Owner" value={`${p.owner.slice(0, 10)}…${p.owner.slice(-6)}`} mono />
        <Row label="Registered" value={new Date(Number(p.timestamp) * 1000).toLocaleDateString()} />
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6 mb-5 space-y-4">
        <div>
          <label className="block text-xs text-[#6b6259] uppercase tracking-wider mb-2">Use Type</label>
          <div className="flex gap-2">
            {(["editorial", "commercial", "ai_training"] as UseType[]).map((t) => (
              <button
                key={t}
                onClick={() => setUseType(t)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors ${
                  useType === t
                    ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                    : "border-white/[0.08] text-[#6b6259] hover:text-[#a89f96]"
                }`}
              >
                {USE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-[#6b6259] uppercase tracking-wider mb-2">URL to License</label>
          <input
            type="url"
            value={licenseUrl}
            onChange={(e) => setLicenseUrl(e.target.value)}
            placeholder="https://yoursite.com/page-with-photo"
            className="w-full rounded-lg border border-white/[0.1] bg-[#0a0806] px-3 py-2 text-sm text-[#f5f0eb] placeholder-[#6b6259] focus:outline-none focus:ring-1 focus:ring-orange-500/40"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-[#a89f96]">License fee</span>
          <span className="text-xl font-bold text-[#f5f0eb]">
            {isBlocked ? (
              <span className="text-red-400 text-sm">AI training blocked by photographer</span>
            ) : price === 0n ? (
              <span className="text-emerald-400">Free</span>
            ) : (
              `$${formatUnits(price, 6)} USDC`
            )}
          </span>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-sm text-red-400">
          {error}
        </p>
      )}

      {!isConnected ? (
        <div className="text-center space-y-3">
          <p className="text-sm text-[#a89f96]">Connect your wallet to pay the license fee.</p>
          <ConnectButton />
        </div>
      ) : (
        <button
          onClick={handlePay}
          disabled={isBlocked || !licenseUrl.trim() || step !== "idle"}
          className="w-full rounded-xl bg-orange-500 px-4 py-3.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(249,115,22,0.3)]"
        >
          {step === "approving" && "Confirm payment in wallet…"}
          {step === "paying" && "Waiting for confirmation…"}
          {step === "recording" && "Recording license on-chain…"}
          {step === "idle" && (price === 0n ? "Claim Free License" : `Pay $${formatUnits(price, 6)} USDC`)}
        </button>
      )}
    </PageShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-[#6b6259]">{label}</span>
      <span className={`text-xs text-[#a89f96] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#0a0806]">
      <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#0a0806]/88 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight text-[#f5f0eb]">
          Eye<span className="text-orange-500">:</span>Witness
        </Link>
        <ConnectButton />
      </nav>
      <div className="mx-auto max-w-lg px-4 py-12">{children}</div>
    </main>
  );
}

function LoadingState() {
  return (
    <PageShell>
      <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
        <p className="text-[#a89f96] text-sm">Loading photo details…</p>
      </div>
    </PageShell>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <PageShell>
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-6 py-10 text-center">
        <p className="text-red-400 text-sm">{message}</p>
      </div>
    </PageShell>
  );
}
