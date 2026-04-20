"use client";

import { LicenseRules } from "@/hooks/useRegisterPhoto";

interface Props {
  rules: LicenseRules;
  onChange: (rules: LicenseRules) => void;
}

export function LicenseRulesForm({ rules, onChange }: Props) {
  function update(field: keyof LicenseRules, value: string | boolean) {
    onChange({ ...rules, [field]: value });
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-[#f5f0eb]">License Pricing (USDC)</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm text-[#a89f96]">Editorial</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rules.editorialPrice}
            onChange={(e) => update("editorialPrice", e.target.value)}
            placeholder="e.g. 1.00"
            className="mt-1.5 block w-full rounded-lg border border-white/[0.1] bg-[#0a0806] px-3 py-2 text-sm text-[#f5f0eb] placeholder-[#6b6259] focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30"
          />
        </label>

        <label className="block">
          <span className="text-sm text-[#a89f96]">Commercial</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rules.commercialPrice}
            onChange={(e) => update("commercialPrice", e.target.value)}
            placeholder="e.g. 5.00"
            className="mt-1.5 block w-full rounded-lg border border-white/[0.1] bg-[#0a0806] px-3 py-2 text-sm text-[#f5f0eb] placeholder-[#6b6259] focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30"
          />
        </label>

        <label className="block">
          <span className="text-sm text-[#a89f96]">AI Training</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rules.aiTrainingPrice}
            onChange={(e) => update("aiTrainingPrice", e.target.value)}
            placeholder="e.g. 10.00"
            disabled={rules.blockAiTraining}
            className="mt-1.5 block w-full rounded-lg border border-white/[0.1] bg-[#0a0806] px-3 py-2 text-sm text-[#f5f0eb] placeholder-[#6b6259] focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
          />
        </label>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={rules.blockAiTraining}
          onChange={(e) => update("blockAiTraining", e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-[#0a0806] accent-orange-500"
        />
        <span className="text-sm text-[#a89f96]">Block AI training use entirely</span>
      </label>
    </div>
  );
}
