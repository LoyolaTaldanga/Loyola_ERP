"use client";

import { useState, useTransition } from "react";
import {
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  previewLeaveApproval,
  type LeaveActionResult,
} from "./actions";
import type { DateLeaveSuggestion } from "@/lib/leave-quota";
import type { LeaveType } from "@/lib/supabase/types";

export function LeaveRequestActions({ id, status }: { id: string; status: "pending" | "approved" }) {
  const [result, setResult] = useState<LeaveActionResult | null>(null);
  const [preview, setPreview] = useState<DateLeaveSuggestion[] | null>(null);
  const [choices, setChoices] = useState<Record<string, LeaveType>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startPreview() {
    setPreviewError(null);
    startTransition(async () => {
      const r = await previewLeaveApproval(id);
      if (r.error) {
        setPreviewError(r.error);
        return;
      }
      setPreview(r.suggestions);
      setChoices(Object.fromEntries(r.suggestions.map((s) => [s.date, s.suggestedType])));
    });
  }

  function confirmApproval() {
    startTransition(async () => {
      const r = await approveLeaveRequest(id, choices);
      setResult(r);
      if (!r.error) setPreview(null);
    });
  }

  function run(action: (id: string) => Promise<LeaveActionResult>) {
    startTransition(async () => {
      const r = await action(id);
      setResult(r);
    });
  }

  if (preview) {
    return (
      <div className="w-64 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
        <p className="mb-1 font-medium text-slate-600">Casual/paid split (editable):</p>
        <ul className="space-y-1">
          {preview.map((s) => (
            <li key={s.date} className="flex items-center justify-between gap-2">
              <span>{s.date}</span>
              <select
                value={choices[s.date]}
                onChange={(e) => setChoices((prev) => ({ ...prev, [s.date]: e.target.value as LeaveType }))}
                className="rounded border border-slate-300 px-1 py-0.5 text-xs"
              >
                <option value="casual">Casual</option>
                <option value="paid">Paid</option>
              </select>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={confirmApproval}
            className="rounded bg-brand-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            {pending ? "Approving…" : "Confirm Approval"}
          </button>
          <button type="button" disabled={pending} onClick={() => setPreview(null)} className="text-slate-400 hover:underline">
            Back
          </button>
        </div>
        {result?.error && <p className="mt-1 text-red-600">{result.error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        {status === "pending" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={startPreview}
              className="rounded bg-brand-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
            >
              {pending ? "Loading…" : "Approve"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(rejectLeaveRequest)}
              className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-60"
            >
              Reject
            </button>
          </>
        )}
        {status === "approved" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(cancelLeaveRequest)}
            className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
      {previewError && <p className="mt-1 max-w-xs text-xs text-red-600">{previewError}</p>}
      {result?.error && <p className="mt-1 max-w-xs text-xs text-red-600">{result.error}</p>}
      {result?.success && <p className="mt-1 max-w-xs text-xs text-green-700">{result.success}</p>}
    </div>
  );
}
