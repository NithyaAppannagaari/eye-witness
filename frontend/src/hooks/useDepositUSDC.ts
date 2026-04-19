"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import MockUSDCABI from "@/abi/MockUSDC.json";
import EscrowVaultABI from "@/abi/EscrowVault.json";

type Step = "idle" | "approving" | "approved" | "depositing" | "done";

export function useDepositUSDC() {
  const [step, setStep] = useState<Step>("idle");
  const [pendingAmount, setPendingAmount] = useState<bigint>(0n);

  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined;
  const vaultAddress = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS as `0x${string}` | undefined;

  const { writeContract: writeApprove, data: approveTx, isPending: isApprovePending, error: approveError } = useWriteContract();
  const { writeContract: writeDeposit, data: depositTx, isPending: isDepositPending, error: depositError } = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTx,
    query: {
      enabled: !!approveTx,
    },
  });

  const { isSuccess: depositConfirmed } = useWaitForTransactionReceipt({
    hash: depositTx,
    query: {
      enabled: !!depositTx,
    },
  });

  // When approve confirms, kick off the deposit
  if (approveConfirmed && step === "approving") {
    setStep("approved");
    writeDeposit({
      address: vaultAddress!,
      abi: EscrowVaultABI.abi,
      functionName: "deposit",
      args: [pendingAmount],
    });
    setStep("depositing");
  }

  if (depositConfirmed && step === "depositing") {
    setStep("done");
  }

  function deposit(amountUsdc: string) {
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

  const isPending = isApprovePending || isDepositPending || step === "approved";
  const error = approveError || depositError;

  return { deposit, step, isPending, depositTx, error, reset };
}
