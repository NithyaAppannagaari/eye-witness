"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import PhotoRegistryABI from "@/abi/PhotoRegistry.json";

export interface LicenseRules {
  editorialPrice: string;
  commercialPrice: string;
  aiTrainingPrice: string;
  blockAiTraining: boolean;
}

function decodeRegisterError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("PhotoAlreadyRegistered") || msg.includes("gas limit too high"))
    return "This photo is already registered on-chain. Use a different photo.";
  if (msg.includes("User rejected") || msg.includes("user rejected"))
    return "Transaction cancelled.";
  return msg;
}

export function useRegisterPhoto() {
  const contractAddress = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS as `0x${string}` | undefined;

  const { mutate: writeContract, data: txHash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  function register(
    photoHash: `0x${string}`,
    metadataHash: `0x${string}`,
    rules: LicenseRules
  ) {
    if (!contractAddress) throw new Error("NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS not set");

    writeContract({
      address: contractAddress,
      abi: PhotoRegistryABI.abi,
      functionName: "registerPhoto",
      // Explicit gas cap bypasses Sepolia's broken eth_estimateGas behaviour
      // (returns max gas on revert → viem throws "gas limit too high" instead of
      // the real Solidity error). registerPhoto costs ~100k gas; 300k is a safe ceiling.
      gas: 300_000n,
      args: [
        photoHash,
        metadataHash,
        {
          editorialPrice: parseUnits(rules.editorialPrice || "0", 6),
          commercialPrice: parseUnits(rules.commercialPrice || "0", 6),
          aiTrainingPrice: parseUnits(rules.aiTrainingPrice || "0", 6),
          blockAiTraining: rules.blockAiTraining,
        },
      ],
    });
  }

  const decodedError = error ? new Error(decodeRegisterError(error)) : null;

  return { register, txHash, isPending, isConfirming, isSuccess, error: decodedError };
}
