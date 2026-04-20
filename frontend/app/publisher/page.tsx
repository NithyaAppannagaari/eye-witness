"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useConnection, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from "wagmi";
import { formatUnits } from "viem";
import { useDepositUSDC } from "@/hooks/useDepositUSDC";
import EscrowVaultABI from "@/abi/EscrowVault.json";
import LicenseEngineABI from "@/abi/LicenseEngine.json";
import MockUSDCABI from "@/abi/MockUSDC.json";
import { parseUnits } from "viem";

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS as `0x${string}` | undefined;
const LICENSE_ENGINE_ADDRESS = process.env.NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS as `0x${string}` | undefined;
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined;

interface LicenseEvent {
  url: string;
  photoId: string;
  publisher: string;
  useType: string;
  timestamp: bigint;
  txHash?: string;
}

export default function PublisherPage() {
  const { address, isConnected } = useConnection();
  const [depositAmount, setDepositAmount] = useState("");
  const [domain, setDomain] = useState("");
  const [licenses, setLicenses] = useState<LicenseEvent[]>([]);

  const { deposit, step: depositStep, isPending: isDepositing, error: depositError, reset: resetDeposit } = useDepositUSDC();

  const { data: escrowBalance, refetch: refetchBalance } = useReadContract({
    address: VAULT_ADDRESS,
    abi: EscrowVaultABI.abi,
    functionName: "getBalance",
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

  const { mutate: claimDomain, isPending: isClaimPending, data: claimTx } = useWriteContract();
  const { isSuccess: claimConfirmed } = useWaitForTransactionReceipt({ hash: claimTx });

  const { mutate: mintUsdc, isPending: isMinting, data: mintTx } = useWriteContract();
  const { isSuccess: mintConfirmed } = useWaitForTransactionReceipt({ hash: mintTx });

  useWatchContractEvent({
    address: LICENSE_ENGINE_ADDRESS,
    abi: LicenseEngineABI.abi,
    eventName: "LicenseMinted",
    onLogs(logs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const relevant = (logs as any[])
        .filter((l) => l.args?.publisher?.toLowerCase() === address?.toLowerCase())
        .map((l) => ({
          url: l.args.url as string,
          photoId: l.args.photoId as string,
          publisher: l.args.publisher as string,
          useType: l.args.useType as string,
          timestamp: l.args.timestamp as bigint,
          txHash: l.transactionHash as string,
        }));
      if (relevant.length > 0) {
        setLicenses((prev) => {
          const existing = new Set(prev.map((e) => e.txHash));
          return [...prev, ...relevant.filter((e) => !existing.has(e.txHash))];
        });
        refetchBalance();
      }
    },
    enabled: !!LICENSE_ENGINE_ADDRESS && isConnected,
  });

  useEffect(() => { resetDeposit(); }, [address]);

  if (depositStep === "done") {
    refetchBalance();
    resetDeposit();
  }

  const balance = escrowBalance ? BigInt(escrowBalance as bigint) : 0n;
  const walletBalance = walletUsdcBalance ? BigInt(walletUsdcBalance as bigint) : 0n;

  return (
    <main className="min-h-screen bg-[#0a0806]">
      <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#0a0806]/88 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight text-[#f5f0eb]">
          Eye<span className="text-orange-500">:</span>Witness
        </Link>
        <ConnectButton />
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-12 space-y-6">
        <h1 className="text-2xl font-bold text-[#f5f0eb] tracking-tight">Publisher Escrow</h1>

        {!isConnected ? (
          <div className="rounded-xl border border-white/[0.08] bg-[#0d0b08] px-6 py-10 text-center">
            <p className="text-[#a89f96] mb-5">Connect your wallet to manage escrow.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Wallet USDC" value={`$${formatUnits(walletBalance, 6)}`} />
              <StatCard label="Escrow Balance" value={`$${formatUnits(balance, 6)}`} highlight />
            </div>

            {/* Mint test USDC */}
            <section className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6">
              <h2 className="font-semibold text-[#f5f0eb] mb-1">Get Test USDC</h2>
              <p className="text-sm text-[#6b6259] mb-4">
                Mint yourself 100 MockUSDC on BNB Testnet to use for deposits.
              </p>
              <button
                disabled={isMinting || !USDC_ADDRESS}
                onClick={() =>
                  mintUsdc({
                    address: USDC_ADDRESS!,
                    abi: MockUSDCABI.abi,
                    functionName: "mint",
                    args: [address!, parseUnits("100", 6)],
                  })
                }
                className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#f5f0eb] hover:bg-white/[0.08] disabled:opacity-40 transition-colors"
              >
                {isMinting ? "Minting…" : "Mint 100 USDC"}
              </button>
              {mintConfirmed && (
                <p className="mt-2 text-sm text-emerald-400">100 USDC minted — refresh balance above.</p>
              )}
            </section>

            {/* Deposit */}
            <section className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6">
              <h2 className="font-semibold text-[#f5f0eb] mb-1">Deposit USDC</h2>
              <p className="text-sm text-[#6b6259] mb-4">
                Deposits are held in escrow. The agent deducts the license fee automatically when your licensed photos are detected.
              </p>
              <div className="flex gap-3">
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Amount (USDC)"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="flex-1 rounded-lg border border-white/[0.1] bg-[#0a0806] px-3 py-2 text-sm text-[#f5f0eb] placeholder-[#6b6259] focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/40"
                />
                <button
                  disabled={!depositAmount || isDepositing}
                  onClick={() => deposit(depositAmount)}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
                >
                  {depositStep === "approving" ? "Approving…" : depositStep === "depositing" ? "Depositing…" : "Deposit"}
                </button>
              </div>
              {depositError && (
                <p className="mt-2 text-sm text-red-400">{depositError.message}</p>
              )}
            </section>

            {/* Claim domain */}
            <section className="rounded-xl border border-white/[0.08] bg-[#0d0b08] p-6">
              <h2 className="font-semibold text-[#f5f0eb] mb-1">Claim Your Domain</h2>
              <p className="text-sm text-[#6b6259] mb-4">
                Register your domain on-chain so the detection agent can identify you as the publisher for automatic licensing.
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="yourdomain.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="flex-1 rounded-lg border border-white/[0.1] bg-[#0a0806] px-3 py-2 text-sm text-[#f5f0eb] placeholder-[#6b6259] focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/40"
                />
                <button
                  disabled={!domain || isClaimPending}
                  onClick={() =>
                    claimDomain({
                      address: VAULT_ADDRESS!,
                      abi: EscrowVaultABI.abi,
                      functionName: "claimDomain",
                      args: [domain],
                    })
                  }
                  className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#f5f0eb] hover:bg-white/[0.08] disabled:opacity-40 transition-colors"
                >
                  {isClaimPending ? "Claiming…" : "Claim Domain"}
                </button>
              </div>
              {claimConfirmed && (
                <p className="mt-2 text-sm text-emerald-400">Domain claimed successfully.</p>
              )}
            </section>

            {/* License history */}
            <section className="rounded-xl border border-white/[0.08] bg-[#0d0b08] overflow-hidden">
              <div className="px-6 py-4 border-b border-white/[0.07]">
                <h2 className="font-semibold text-[#f5f0eb]">Active Licenses</h2>
                <p className="text-xs text-[#6b6259] mt-0.5">Licenses minted for your wallet in this session</p>
              </div>
              {licenses.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-[#6b6259]">
                  No licenses yet. Licenses appear here as the agent processes detections.
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
                    {licenses.map((l, i) => (
                      <tr key={i} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-xs text-[#a89f96] truncate max-w-xs">
                          <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#f5f0eb] transition-colors">{l.url}</a>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-orange-500/[0.1] border border-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">{l.useType}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6b6259]">
                          {new Date(Number(l.timestamp) * 1000).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {l.txHash && (
                            <a
                              href={`https://testnet.bscscan.com/tx/${l.txHash}`}
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

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-5 py-5 ${highlight ? "border-orange-500/[0.25] bg-orange-500/[0.06]" : "border-white/[0.08] bg-[#0d0b08]"}`}>
      <p className="text-[11px] text-[#6b6259] uppercase tracking-widest">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${highlight ? "text-orange-400" : "text-[#f5f0eb]"}`}>{value}</p>
    </div>
  );
}
