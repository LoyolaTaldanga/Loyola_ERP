"use client";

import { useState, useTransition } from "react";
import { resolveAmbiguousSlot } from "../actions";
import { DAY_ABBR } from "@/lib/timetable-grid";

interface AmbiguousItem {
  className: string;
  stream: string | null;
  sectionName: string;
  section: string;
  dayOfWeek: number;
  periodNumber: number;
  classWiseSubject: string;
  candidates: { teacherName: string; subjectRaw: string }[];
}

export function AmbiguousRow({
  item,
  sessionId,
  readOnly,
}: {
  item: AmbiguousItem;
  sessionId: string;
  readOnly: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleResolve() {
    if (!selected) {
      setError("Pick a teacher first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resolveAmbiguousSlot({
        className: item.className,
        stream: item.stream,
        sectionName: item.sectionName,
        dayOfWeek: item.dayOfWeek,
        periodNumber: item.periodNumber,
        teacherName: selected,
        sessionId,
      });
      if (result.error) setError(result.error);
      else setResolved(true);
    });
  }

  if (resolved) {
    return (
      <tr className="border-t border-slate-100 bg-green-50">
        <td className="px-3 py-2 text-green-700" colSpan={4}>
          ✓ Resolved: {item.section}, {DAY_ABBR[item.dayOfWeek]} / P{item.periodNumber} → {selected}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2">{item.section}</td>
      <td className="px-3 py-2">
        {DAY_ABBR[item.dayOfWeek]} / P{item.periodNumber}
      </td>
      <td className="px-3 py-2">{item.classWiseSubject}</td>
      <td className="px-3 py-2">
        {readOnly ? (
          <span className="text-xs text-slate-400">Read-only</span>
        ) : (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="">Pick teacher…</option>
            {item.candidates.map((c) => (
              <option key={c.teacherName} value={c.teacherName}>
                {c.teacherName} ({c.subjectRaw})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleResolve}
            disabled={pending}
            className="rounded bg-brand-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Resolve"}
          </button>
        </div>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
