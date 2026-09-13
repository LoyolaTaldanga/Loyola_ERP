"use client";

import { useState, useTransition } from "react";
import { assignSubstitute } from "./actions";
import type { AssignmentMethod, SubstitutionStatus } from "@/lib/supabase/types";

interface TeacherOption {
  id: string;
  name: string;
}

export interface SubstitutionRowData {
  id: string;
  absenceId: string | null;
  date: string;
  periodLabel: string;
  sectionLabel: string;
  subjectName: string | null;
  absentTeacherName: string;
  status: SubstitutionStatus;
  assignmentMethod: AssignmentMethod;
  isExceptionFallback: boolean;
  substituteTeacherName: string | null;
  note: string | null;
}

const STATUS_LABEL: Record<SubstitutionStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  confirmed: "Confirmed",
  flagged_for_review: "Needs Review",
  cancelled: "Cancelled",
};

export function SubstituteRow({
  substitution,
  freeTeachers,
  busyTeachers,
}: {
  substitution: SubstitutionRowData;
  freeTeachers: TeacherOption[];
  busyTeachers: TeacherOption[];
}) {
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<{ error: string | null; emailWarning: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const isBusy = busyTeachers.some((t) => t.id === selected);
  const selectedName = [...freeTeachers, ...busyTeachers].find((t) => t.id === selected)?.name;

  const currentSubstituteName = result && !result.error ? selectedName : substitution.substituteTeacherName;
  const currentStatus: SubstitutionStatus = result && !result.error ? "assigned" : substitution.status;

  function handleAssign() {
    if (!selected) return;
    startTransition(async () => {
      const r = await assignSubstitute(substitution.id, selected);
      setResult(r);
    });
  }

  const rowClass =
    substitution.isExceptionFallback && !(result && !result.error)
      ? "border-t border-amber-200 bg-amber-50"
      : "border-t border-slate-100";

  return (
    <tr className={rowClass}>
      <td className="px-3 py-2">{substitution.date}</td>
      <td className="px-3 py-2">{substitution.periodLabel}</td>
      <td className="px-3 py-2">
        {substitution.sectionLabel}
        <div className="text-xs text-slate-500">{substitution.subjectName ?? "no subject"}</div>
      </td>
      <td className="px-3 py-2">{substitution.absentTeacherName}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              currentStatus === "flagged_for_review"
                ? "bg-amber-100 text-amber-800"
                : currentStatus === "pending"
                  ? "bg-slate-100 text-slate-600"
                  : "bg-green-100 text-green-700"
            }`}
          >
            {STATUS_LABEL[currentStatus]}
          </span>
          {substitution.assignmentMethod === "auto" && !(result && !result.error) && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Auto</span>
          )}
        </div>
        {currentSubstituteName && <div className="mt-1 text-xs text-slate-600">→ {currentSubstituteName}</div>}
        {substitution.note && !currentSubstituteName && (
          <div className="mt-1 text-xs text-red-600">{substitution.note}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="">Pick substitute…</option>
            {freeTeachers.length > 0 && (
              <optgroup label="Free at this period">
                {freeTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            {busyTeachers.length > 0 && (
              <optgroup label="Busy at this period">
                {busyTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            onClick={handleAssign}
            disabled={pending || !selected}
            className="rounded bg-brand-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Override"}
          </button>
        </div>
        {isBusy && <p className="mt-1 text-xs text-amber-600">⚠ Already has a class at this time.</p>}
        {result?.error && <p className="mt-1 text-xs text-red-600">{result.error}</p>}
        {result?.emailWarning && <p className="mt-1 text-xs text-amber-600">{result.emailWarning}</p>}
      </td>
      <td className="px-3 py-2">
        {substitution.absenceId && (
          <div className="flex gap-2 text-xs">
            <a
              href={`/api/substitutions/absence/${substitution.absenceId}?format=xlsx`}
              className="text-brand-primary underline"
            >
              Excel
            </a>
            <a
              href={`/api/substitutions/absence/${substitution.absenceId}?format=pdf`}
              className="text-brand-primary underline"
            >
              PDF
            </a>
          </div>
        )}
      </td>
    </tr>
  );
}
