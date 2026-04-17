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
      <h3 className="font-semibold text-gray-900">License Pricing (USDC)</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm text-gray-600">Editorial</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rules.editorialPrice}
            onChange={(e) => update("editorialPrice", e.target.value)}
            placeholder="e.g. 1.00"
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-600">Commercial</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rules.commercialPrice}
            onChange={(e) => update("commercialPrice", e.target.value)}
            placeholder="e.g. 5.00"
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-600">AI Training</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rules.aiTrainingPrice}
            onChange={(e) => update("aiTrainingPrice", e.target.value)}
            placeholder="e.g. 10.00"
            disabled={rules.blockAiTraining}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={rules.blockAiTraining}
          onChange={(e) => update("blockAiTraining", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
        <span className="text-sm text-gray-700">Block AI training use entirely</span>
      </label>
    </div>
  );
}
