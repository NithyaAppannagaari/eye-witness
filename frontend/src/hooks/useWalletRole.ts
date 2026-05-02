"use client";

import { useEffect, useState } from "react";
import { useConnection, useReadContract } from "wagmi";
import { agentApi } from "@/lib/agent-api";
import EscrowVaultABI from "@/abi/EscrowVault.json";

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS as `0x${string}` | undefined;

export type Role = "photographer" | "publisher" | "both" | "none";

export interface WalletRole {
  role: Role;
  isPhotographer: boolean;
  isPublisher: boolean;
  photoCount: number;
  escrowBalance: bigint;          // 6-decimal USDC
  hasLedgerActivity: boolean;     // has been charged at least once
  loading: boolean;
}

// Combines three signals to classify a connected wallet:
//   1. agent API /api/photos — has it registered any photos?
//   2. EscrowVault.getBalance — does it have escrow right now?
//   3. agent API /api/ledger — has it ever been charged (covers depositors who got drained)
//
// "publisher" requires either (2) or (3); a wallet that's never deposited shouldn't
// be classified just because someone called view-only methods.
export function useWalletRole(): WalletRole {
  const { address, isConnected } = useConnection();
  const [photoCount, setPhotoCount] = useState(0);
  const [hasLedgerActivity, setHasLedgerActivity] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: escrow } = useReadContract({
    address: VAULT_ADDRESS,
    abi: EscrowVaultABI.abi,
    functionName: "getBalance",
    args: [address!],
    query: { enabled: !!VAULT_ADDRESS && !!address, refetchInterval: 15_000 },
  });

  useEffect(() => {
    if (!isConnected || !address) {
      setPhotoCount(0);
      setHasLedgerActivity(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [photos, ledger] = await Promise.all([
          agentApi.photosByOwner(address).catch(() => []),
          agentApi.ledgerByPublisher(address).catch(() => []),
        ]);
        if (!cancelled) {
          setPhotoCount(photos.length);
          setHasLedgerActivity(ledger.length > 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address, isConnected]);

  const escrowBalance = escrow ? BigInt(escrow as bigint) : 0n;
  const isPhotographer = photoCount > 0;
  const isPublisher = escrowBalance > 0n || hasLedgerActivity;

  let role: Role = "none";
  if (isPhotographer && isPublisher) role = "both";
  else if (isPhotographer) role = "photographer";
  else if (isPublisher) role = "publisher";

  return { role, isPhotographer, isPublisher, photoCount, escrowBalance, hasLedgerActivity, loading };
}
