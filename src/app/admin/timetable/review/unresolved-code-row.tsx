"use client";

import { useState, useTransition } from "react";
import { resolveUnresolvedCodeToExistingSection, resolveUnresolvedCodeToNewSection } from "../actions";

export function UnresolvedCodeRow({
  codeRaw,
  count,
  sections,
  classes,
  readOnly,
}: {
  codeRaw: string;
  count: number;
  sections: { id: string; label: string }[];
  classes: { id: string; label: string }[];
  readOnly: boolean;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [sectionId, setSectionId] = useState("");
  const [classId, setClassId] = useState("");
  const [newName, setNewName] = useState("");
  const [result, setResult] = useState<{ error: string | null; applied?: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleApply() {
    setResult(null);
    startTransition(async () => {
      const r =
        mode === "existing"
          ? await resolveUnresolvedCodeToExistingSection(codeRaw, sectionId)
          : await resolveUnresolvedCodeToNewSection(codeRaw, classId, newName);
      setResult(r);
    });
  }

  const done = result && !result.error;
  const canApply = mode === "existing" ? !!sectionId : !!classId && !!newName.trim();

  return (
    <tr className={`border-t border-slate-100 ${done ? "bg-green-50" : ""}`}>
      <td className="px-3 py-2 font-mono">{codeRaw || "(blank)"}</td>
      <td className="px-3 py-2">{count}</td>
      <td className="px-3 py-2">
        {readOnly ? (
          <span className="text-xs text-slate-400">Read-only</span>
        ) : done ? (
          <span className="text-green-700">✓ Applied to {result.applied} occurrence(s)</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "existing" | "new")}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="existing">Existing section</option>
              <option value="new">Create new section</option>
            </select>
            {mode === "existing" ? (
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="">Pick section…</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="">Pick class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Section name (e.g. E)"
                  className="w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                />
              </>
            )}
            <button
              type="button"
              onClick={handleApply}
              disabled={pending || !canApply}
              className="rounded bg-brand-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
            >
              {pending ? "Applying…" : "Apply"}
            </button>
          </div>
        )}
        {result?.error && <p className="mt-1 text-xs text-red-600">{result.error}</p>}
      </td>
    </tr>
  );
}
