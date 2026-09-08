"use client";

import { useState, useTransition } from "react";
import { assignClassTeacher, unassignClassTeacher } from "./actions";

interface SectionOption {
  id: string;
  label: string;
  currentTeacherId: string | null;
  currentTeacherName: string | null;
}

export function AssignClassTeacher({ teacherId, sections }: { teacherId: string; sections: SectionOption[] }) {
  const [sectionId, setSectionId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const selected = sections.find((s) => s.id === sectionId);
  const needsConfirm = !!(selected?.currentTeacherId && selected.currentTeacherId !== teacherId);

  function handleClick() {
    if (needsConfirm && !confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await assignClassTeacher(sectionId, teacherId);
      if (r.error) setError(r.error);
      else setSuccess(true);
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={sectionId}
        onChange={(e) => {
          setSectionId(e.target.value);
          setConfirming(false);
          setSuccess(false);
        }}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        <option value="">Pick a section…</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label} — {s.currentTeacherName ? `currently: ${s.currentTeacherName}` : "unassigned"}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleClick}
        disabled={!sectionId || pending}
        className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending
          ? "Saving…"
          : needsConfirm && confirming
            ? `Confirm reassign from ${selected?.currentTeacherName}?`
            : "Assign as Class Teacher"}
      </button>
      {confirming && (
        <button type="button" onClick={() => setConfirming(false)} className="text-sm text-slate-400 hover:underline">
          Cancel
        </button>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
      {success && <span className="text-sm text-green-700">Assigned.</span>}
    </div>
  );
}

export function UnassignClassTeacherButton({ sectionId, sectionLabel }: { sectionId: string; sectionLabel: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return null;

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs text-red-600 hover:underline">
        Unassign
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      Remove as class teacher of {sectionLabel}?
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await unassignClassTeacher(sectionId);
            if (r.error) setError(r.error);
            else setDone(true);
          })
        }
        className="font-medium text-red-600 hover:underline disabled:opacity-60"
      >
        {pending ? "Removing…" : "Yes"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-slate-400 hover:underline">
        Cancel
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}
