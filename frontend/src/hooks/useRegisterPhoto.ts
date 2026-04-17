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

export function useRegisterPhoto() {
  const contractAddress = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS as `0x${string}` | undefined;

  const { writeContract, data: txHash, isPending, error } = useWriteContract();

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

  return { register, txHash, isPending, isConfirming, isSuccess, error };
}
