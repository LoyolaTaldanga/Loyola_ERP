"use client";

import { useState, useTransition } from "react";
import { updateTeacherGroup } from "./actions";
import type { TeacherGroup } from "@/lib/supabase/types";

export function GroupSelect({
  teacherId,
  initialGroup,
  needsReview,
}: {
  teacherId: string;
  initialGroup: TeacherGroup;
  needsReview: boolean;
}) {
  const [group, setGroup] = useState<TeacherGroup>(initialGroup);
  const [flagged, setFlagged] = useState(needsReview);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TeacherGroup;
    const previous = group;
    setGroup(next);
    setError(null);
    startTransition(async () => {
      const result = await updateTeacherGroup(teacherId, next);
      if (result.error) {
        setError(result.error);
        setGroup(previous);
      } else {
        setFlagged(false);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={group}
        onChange={handleChange}
        disabled={pending}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary disabled:opacity-60"
      >
        <option value="A">A</option>
        <option value="B">B</option>
      </select>
      {pending && <span className="text-xs text-slate-400">Saving…</span>}
      {!pending && flagged && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          Verify
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
