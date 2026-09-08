"use client";

import { useState, useTransition } from "react";
import { updateRule } from "./actions";
import type { SubstitutionRule } from "@/lib/supabase/types";

const RULE_LABELS: Record<string, string> = {
  min_free_periods_same_subject: "Minimum free periods (same-subject match)",
  workload_tiebreak: "Workload tiebreak",
  pt_games_restriction: "PT/Games restriction",
  group_preference: "Group preference",
};

const RULE_DESCRIPTIONS: Record<string, string> = {
  min_free_periods_same_subject:
    "A same-subject teacher only qualifies as a primary-path substitute if they have at least this many free periods that day.",
  workload_tiebreak: "Among equally-ranked candidates, prefer whoever has taught/substituted the fewest periods today.",
  pt_games_restriction:
    "Games periods can only be covered by a teacher qualified for Games; a Games-only teacher can't cover non-Games periods.",
  group_preference: "Prefer a substitute whose group (A/B) matches the target section's grade band.",
};

export function RuleRow({ rule }: { rule: SubstitutionRule }) {
  const [isActive, setIsActive] = useState(rule.is_active);
  const [priorityOrder, setPriorityOrder] = useState(rule.priority_order);
  const [minFreePeriods, setMinFreePeriods] = useState(
    typeof rule.config.min_free_periods === "number" ? rule.config.min_free_periods : 2
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(patch: { isActive?: boolean; priorityOrder?: number; config?: Record<string, unknown> }) {
    setError(null);
    startTransition(async () => {
      const r = await updateRule({ ruleId: rule.id, ...patch });
      if (r.error) setError(r.error);
    });
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-800">{RULE_LABELS[rule.rule_key] ?? rule.rule_key}</div>
        <div className="text-xs text-slate-500">{RULE_DESCRIPTIONS[rule.rule_key]}</div>
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          value={priorityOrder}
          onChange={(e) => setPriorityOrder(Number(e.target.value))}
          onBlur={() => save({ priorityOrder })}
          className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => {
              setIsActive(e.target.checked);
              save({ isActive: e.target.checked });
            }}
          />
          <span className="text-sm text-slate-600">{isActive ? "Active" : "Inactive"}</span>
        </label>
      </td>
      <td className="px-4 py-3">
        {rule.rule_key === "min_free_periods_same_subject" ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={minFreePeriods}
              onChange={(e) => setMinFreePeriods(Number(e.target.value))}
              onBlur={() => save({ config: { ...rule.config, min_free_periods: minFreePeriods } })}
              className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <span className="text-xs text-slate-500">min free periods</span>
          </div>
        ) : (
          <span className="text-xs text-slate-400">No additional config</span>
        )}
        {pending && <span className="ml-2 text-xs text-slate-400">Saving…</span>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
