"use client";

import { useState, useTransition } from "react";
import { updateLeaveQuotaOverride } from "./actions";

export function LeaveQuotaOverrideInput({
  teacherId,
  initialValue,
  defaultQuota,
}: {
  teacherId: string;
  initialValue: number | null;
  defaultQuota: number;
}) {
  const [value, setValue] = useState<string>(initialValue == null ? "" : String(initialValue));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const previous = value;
    setValue(raw);
    setError(null);
    const parsed = raw.trim() === "" ? null : Number(raw);
    startTransition(async () => {
      const r = await updateLeaveQuotaOverride(teacherId, parsed);
      if (r.error) {
        setError(r.error);
        setValue(previous);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={value}
        onChange={handleChange}
        disabled={pending}
        placeholder={String(defaultQuota)}
        className="w-16 rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-60"
      />
      {pending && <span className="text-xs text-slate-400">Saving…</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
