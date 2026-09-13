"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { markAbsence, previewAbsenceLeaveType, type MarkAbsenceState } from "./actions";
import type { LeaveType } from "@/lib/supabase/types";

export interface TeacherPeriodEntry {
  periodSlotId: string;
  periodNumber: number;
  periodLabel: string;
  sectionLabel: string;
  subjectName: string | null;
}

const initialState: MarkAbsenceState = { error: null, success: null };

export function AbsenceForm({
  teachers,
  entriesByTeacherAndDay,
  defaultDate,
}: {
  teachers: { id: string; name: string }[];
  entriesByTeacherAndDay: Record<string, Record<number, TeacherPeriodEntry[]>>;
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(markAbsence, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [teacherId, setTeacherId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState<"full_day" | "partial">("full_day");
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set());
  const [leaveType, setLeaveType] = useState<LeaveType>("casual");
  const [leaveTypeLoading, setLeaveTypeLoading] = useState(false);

  useEffect(() => {
    if (state.success) {
      setTeacherId("");
      setSelectedPeriods(new Set());
      setStatus("full_day");
      setLeaveType("casual");
      formRef.current?.reset();
    }
  }, [state.success]);

  const dayOfWeek = useMemo(() => new Date(`${date}T00:00:00`).getDay(), [date]);
  const isWeekend = dayOfWeek < 1 || dayOfWeek > 5;
  const periodsToday = teacherId ? (entriesByTeacherAndDay[teacherId]?.[dayOfWeek] ?? []) : [];

  // Only meaningful for a full-day mark — refetch the casual/paid suggestion
  // whenever teacher/date change, so it always reflects that teacher's
  // current-year casual balance for that specific date.
  useEffect(() => {
    if (!teacherId || !date || isWeekend || status !== "full_day") return;
    let cancelled = false;
    setLeaveTypeLoading(true);
    previewAbsenceLeaveType(teacherId, date).then((r) => {
      if (!cancelled && r.suggestedType) setLeaveType(r.suggestedType);
      if (!cancelled) setLeaveTypeLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [teacherId, date, isWeekend, status]);

  function togglePeriod(id: string) {
    setSelectedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="teacherId" className="text-sm font-medium text-slate-700">
            Teacher
          </label>
          <select
            id="teacherId"
            name="teacherId"
            required
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value);
              setSelectedPeriods(new Set());
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
          >
            <option value="">Select…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="date" className="text-sm font-medium text-slate-700">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelectedPeriods(new Set());
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
          />
        </div>
      </div>

      {isWeekend && <p className="text-sm text-amber-600">That date is a weekend — no timetable exists for it.</p>}

      {teacherId && !isWeekend && (
        <>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="status"
                value="full_day"
                checked={status === "full_day"}
                onChange={() => setStatus("full_day")}
              />
              Full day
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="status"
                value="partial"
                checked={status === "partial"}
                onChange={() => setStatus("partial")}
              />
              Specific periods
            </label>
          </div>

          {status === "full_day" && periodsToday.length > 0 && (
            <fieldset className="flex items-center gap-4 rounded-md border border-slate-200 p-3 text-sm">
              <legend className="px-1 text-xs font-medium text-slate-500">Leave type</legend>
              <input type="hidden" name="leaveType" value={leaveType} />
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={leaveType === "casual"}
                  onChange={() => setLeaveType("casual")}
                />
                Casual
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={leaveType === "paid"}
                  onChange={() => setLeaveType("paid")}
                />
                Paid
              </label>
              {leaveTypeLoading && <span className="text-xs text-slate-400">Checking balance…</span>}
            </fieldset>
          )}

          {periodsToday.length === 0 ? (
            <p className="text-sm text-slate-400">This teacher has no periods scheduled that day.</p>
          ) : (
            status === "partial" && (
              <fieldset className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
                <legend className="px-1 text-xs font-medium text-slate-500">Affected periods</legend>
                {periodsToday.map((p) => (
                  <label key={p.periodSlotId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="periodSlotIds"
                      value={p.periodSlotId}
                      checked={selectedPeriods.has(p.periodSlotId)}
                      onChange={() => togglePeriod(p.periodSlotId)}
                    />
                    {p.periodLabel} — {p.sectionLabel} ({p.subjectName ?? "no subject"})
                  </label>
                ))}
              </fieldset>
            )
          )}
        </>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium text-slate-700">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending || !teacherId || isWeekend || periodsToday.length === 0}
        className="w-fit rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary-dark disabled:opacity-60"
      >
        {pending ? "Saving…" : "Mark Absent"}
      </button>
    </form>
  );
}
