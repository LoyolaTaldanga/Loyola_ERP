"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveTimetableCell } from "@/lib/actions/save-timetable-cell";

interface Option {
  id: string;
  name: string;
}

export function TimetableCell({
  sectionId,
  dayOfWeek,
  periodSlotId,
  initialSubjectId,
  initialSubjectName,
  initialTeacherId,
  initialTeacherName,
  initialIsPractical,
  subjects,
  teachers,
  qualifiedTeacherIdsBySubject,
  sectionLabel,
  jumpHref,
  readOnly,
}: {
  sectionId: string;
  dayOfWeek: number;
  periodSlotId: string;
  initialSubjectId: string | null;
  initialSubjectName: string | null;
  initialTeacherId: string | null;
  initialTeacherName: string | null;
  initialIsPractical: boolean;
  subjects: Option[];
  teachers: Option[];
  qualifiedTeacherIdsBySubject: Record<string, string[]>;
  /** Shown above the subject — only relevant on a cross-section grid (a teacher's own timetable). */
  sectionLabel?: string;
  /** "Go to class timetable" link target — only relevant on a cross-section grid. */
  jumpHref?: string;
  /** Viewing an archived session — the server rejects the write regardless, this just avoids presenting an edit affordance that will fail. */
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? "");
  const [teacherId, setTeacherId] = useState(initialTeacherId ?? "");
  const [isPractical, setIsPractical] = useState(initialIsPractical);
  const [subjectName, setSubjectName] = useState(initialSubjectName);
  const [teacherName, setTeacherName] = useState(initialTeacherName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveTimetableCell({
        sectionId,
        dayOfWeek,
        periodSlotId,
        subjectId: subjectId || null,
        teacherId: teacherId || null,
        isPractical,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubjectName(subjects.find((s) => s.id === subjectId)?.name ?? null);
      setTeacherName(teachers.find((t) => t.id === teacherId)?.name ?? null);
      setEditing(false);
    });
  }

  function handleCancel() {
    setSubjectId(initialSubjectId ?? "");
    setTeacherId(initialTeacherId ?? "");
    setIsPractical(initialIsPractical);
    setError(null);
    setEditing(false);
  }

  const jumpLink = jumpHref && (
    <Link
      href={jumpHref}
      title="Go to class timetable"
      onClick={(e) => e.stopPropagation()}
      className="text-slate-400 hover:text-brand-primary"
    >
      ↗
    </Link>
  );

  if (!editing) {
    const content = (
      <>
        {sectionLabel && <div className="text-xs font-medium text-brand-secondary">{sectionLabel}</div>}
        {subjectName ? (
          <div>
            <div className="font-medium text-slate-800">
              {subjectName}
              {isPractical && <span className="ml-1 text-xs font-normal text-brand-secondary">(Practical)</span>}
            </div>
            <div className="text-xs text-slate-500">{teacherName ?? "— no teacher —"}</div>
          </div>
        ) : (
          <span className="text-slate-300">{readOnly ? "—" : "+ Add"}</span>
        )}
      </>
    );
    return (
      <div className="flex items-start justify-between gap-1 rounded px-2 py-1 hover:bg-slate-50">
        {readOnly ? (
          <div className="flex-1 text-left">{content}</div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="flex-1 text-left">
            {content}
          </button>
        )}
        {jumpLink}
      </div>
    );
  }

  const qualifiedIds = new Set(qualifiedTeacherIdsBySubject[subjectId] ?? []);
  const qualifiedTeachers = teachers.filter((t) => qualifiedIds.has(t.id));
  const otherTeachers = teachers.filter((t) => !qualifiedIds.has(t.id));

  return (
    <div className="flex w-40 flex-col gap-1 rounded border border-brand-primary bg-white p-2 shadow-sm">
      {sectionLabel && (
        <div className="flex items-center justify-between text-xs font-medium text-brand-secondary">
          <span>{sectionLabel}</span>
          {jumpLink}
        </div>
      )}
      <select
        value={subjectId}
        onChange={(e) => setSubjectId(e.target.value)}
        className="rounded border border-slate-300 px-1 py-0.5 text-xs"
      >
        <option value="">— no subject —</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <select
        value={teacherId}
        onChange={(e) => setTeacherId(e.target.value)}
        className="rounded border border-slate-300 px-1 py-0.5 text-xs"
      >
        <option value="">— no teacher —</option>
        {qualifiedTeachers.length > 0 && (
          <optgroup label="Qualified for this subject">
            {qualifiedTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={qualifiedTeachers.length > 0 ? "All other teachers" : "All teachers"}>
          {otherTeachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </optgroup>
      </select>

      <label className="flex items-center gap-1 text-xs text-slate-600">
        <input type="checkbox" checked={isPractical} onChange={(e) => setIsPractical(e.target.checked)} />
        Practical
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded bg-brand-primary px-2 py-0.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
