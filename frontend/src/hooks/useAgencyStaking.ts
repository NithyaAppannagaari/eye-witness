"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import MockUSDCABI from "@/abi/MockUSDC.json";
import EscrowVaultABI from "@/abi/EscrowVault.json";

type Step = "idle" | "approving" | "approved" | "staking" | "done";

export function useAgencyStaking() {
  const [step, setStep] = useState<Step>("idle");
  const [pendingAmount, setPendingAmount] = useState<bigint>(0n);

  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined;
  const vaultAddress = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS as `0x${string}` | undefined;

  const { writeContract: writeApprove, data: approveTx, isPending: isApprovePending, error: approveError } = useWriteContract();
  const { writeContract: writeStake, data: stakeTx, isPending: isStakePending, error: stakeError } = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTx,
    query: { enabled: !!approveTx },
  });

  const { isSuccess: stakeConfirmed } = useWaitForTransactionReceipt({
    hash: stakeTx,
    query: { enabled: !!stakeTx },
  });

  if (approveConfirmed && step === "approving") {
    setStep("approved");
    writeStake({
      address: vaultAddress!,
      abi: EscrowVaultABI.abi,
      functionName: "stakeAgency",
      args: [pendingAmount],
    });
    setStep("staking");
  }

  if (stakeConfirmed && step === "staking") {
    setStep("done");
  }

  function stake(amountUsdc: string) {
    if (!usdcAddress || !vaultAddress) throw new Error("Contract addresses not set");
    const amount = parseUnits(amountUsdc, 6);
    setPendingAmount(amount);
    setStep("approving");
    writeApprove({
      address: usdcAddress,
      abi: MockUSDCABI.abi,
      functionName: "approve",
      args: [vaultAddress, amount],
    });
  }

  function reset() {
    setStep("idle");
    setPendingAmount(0n);
  }

  return { stake, step, isPending: isApprovePending || isStakePending || step === "approved", stakeTx, error: approveError || stakeError, reset };
}
