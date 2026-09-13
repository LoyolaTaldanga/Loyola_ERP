"use client";

import { useState } from "react";
import type { TeacherLeaveSummary } from "@/lib/leave-quota";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function LeaveSummaryCard({ summary, year }: { summary: TeacherLeaveSummary; year: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-brand-primary">Leave Summary ({year})</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Total Quota</p>
          <p className="text-xl font-semibold text-slate-800">{summary.quota}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Taken (Casual)</p>
          <p className="text-xl font-semibold text-slate-800">{summary.casualTaken}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Left (Casual)</p>
          <p className="text-xl font-semibold text-slate-800">{summary.casualLeft}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Total Paid Leave</p>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            disabled={summary.paidByMonth.length === 0}
            className="text-xl font-semibold text-brand-primary underline decoration-dotted disabled:cursor-default disabled:text-slate-800 disabled:no-underline"
          >
            {summary.totalPaid}
          </button>
        </div>
      </div>

      {expanded && summary.paidByMonth.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-500">Paid leave by month, {year}</p>
          <table className="w-full max-w-xs text-left text-sm">
            <tbody>
              {summary.paidByMonth.map((m) => (
                <tr key={m.month} className="border-t border-slate-100">
                  <td className="py-1 pr-4">{MONTH_NAMES[m.month - 1]}</td>
                  <td className="py-1 text-right">{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
