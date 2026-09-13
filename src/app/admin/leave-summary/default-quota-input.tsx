"use client";

import { useState, useTransition } from "react";
import { updateDefaultLeaveQuota } from "./actions";

export function DefaultQuotaInput({ initialValue }: { initialValue: number }) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = Number(e.target.value);
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const r = await updateDefaultLeaveQuota(next);
      if (r.error) {
        setError(r.error);
        setValue(previous);
      }
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-slate-600">Global default annual leave quota</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={handleChange}
        disabled={pending}
        className="w-20 rounded border border-slate-300 px-2 py-1 disabled:opacity-60"
      />
      {pending && <span className="text-xs text-slate-400">Saving…</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}
