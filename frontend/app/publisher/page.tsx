"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useConnection, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { useDepositUSDC } from "@/hooks/useDepositUSDC";
import EscrowVaultABI from "@/abi/EscrowVault.json";
import LicenseEngineABI from "@/abi/LicenseEngine.json";
import MockUSDCABI from "@/abi/MockUSDC.json";

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

  // Read escrow balance — poll every 15s
  const { data: escrowBalance, refetch: refetchBalance } = useReadContract({
    address: VAULT_ADDRESS,
    abi: EscrowVaultABI.abi,
    functionName: "getBalance",
    args: [address!],
    query: { enabled: !!VAULT_ADDRESS && !!address, refetchInterval: 15_000 },
  });

  // Read USDC wallet balance
  const { data: walletUsdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI.abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!USDC_ADDRESS && !!address, refetchInterval: 15_000 },
  });

  // Claim domain
  const { mutate: claimDomain, isPending: isClaimPending, data: claimTx } = useWriteContract();
  const { isSuccess: claimConfirmed } = useWaitForTransactionReceipt({ hash: claimTx });

  // Watch LicenseMinted events — collect ones for this publisher
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
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight">Eye:Witness</Link>
        <ConnectButton />
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Publisher Escrow</h1>

        {!isConnected ? (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
            <p className="text-gray-600 mb-4">Connect your wallet to manage escrow.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            {/* Balances */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Wallet USDC" value={`$${formatUnits(walletBalance, 6)}`} />
              <StatCard label="Escrow Balance" value={`$${formatUnits(balance, 6)}`} highlight />
            </div>

            {/* Deposit */}
            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Deposit USDC</h2>
              <p className="text-sm text-gray-500 mb-4">
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
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  disabled={!depositAmount || isDepositing}
                  onClick={() => deposit(depositAmount)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {depositStep === "approving" ? "Approving…" : depositStep === "depositing" ? "Depositing…" : "Deposit"}
                </button>
              </div>
              {depositError && (
                <p className="mt-2 text-sm text-red-600">{depositError.message}</p>
              )}
            </section>

            {/* Claim domain */}
            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="font-semibold text-gray-900 mb-1">Claim Your Domain</h2>
              <p className="text-sm text-gray-500 mb-4">
                Register your domain on-chain so the detection agent can identify you as the publisher for automatic licensing.
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="yourdomain.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-40 transition-colors"
                >
                  {isClaimPending ? "Claiming…" : "Claim Domain"}
                </button>
              </div>
              {claimConfirmed && (
                <p className="mt-2 text-sm text-green-600">Domain claimed successfully.</p>
              )}
            </section>

            {/* License history */}
            <section className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Active Licenses</h2>
                <p className="text-xs text-gray-500 mt-0.5">Licenses minted for your wallet in this session</p>
              </div>
              {licenses.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-gray-400">
                  No licenses yet. Licenses appear here as the agent processes detections.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Use Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tx</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {licenses.map((l, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-600 truncate max-w-xs">
                          <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{l.url}</a>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{l.useType}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(Number(l.timestamp) * 1000).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {l.txHash && (
                            <a href={`https://testnet.bscscan.com/tx/${l.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
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
    <div className={`rounded-lg border px-4 py-5 ${highlight ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${highlight ? "text-blue-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
