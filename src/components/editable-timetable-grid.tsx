import { DAYS } from "@/lib/timetable-grid";
import { TimetableCell } from "./timetable-cell";
import type { PeriodSlot } from "@/lib/supabase/types";

export interface EditableCellData {
  section_id: string;
  day_of_week: number;
  period_slot_id: string;
  subject_id: string | null;
  subject_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  is_practical: boolean;
  /** Shown above the subject — pass this on a cross-section grid (a teacher's own timetable). */
  sectionLabel?: string;
  /** "Go to class timetable" link target — pass this on a cross-section grid. */
  jumpHref?: string;
}

export function EditableTimetableGrid({
  periodSlots,
  cells,
  subjects,
  teachers,
  qualifiedTeacherIdsBySubject,
  defaultSectionId,
}: {
  periodSlots: PeriodSlot[];
  cells: EditableCellData[];
  subjects: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  qualifiedTeacherIdsBySubject: Record<string, string[]>;
  /**
   * Section-view grids: pass the section's id here so an empty day/period
   * slot is still editable (Admin can assign a subject/teacher to it).
   * Omit for cross-section grids (a teacher's own timetable) — there's no
   * single section context for an empty slot there, it just means the
   * teacher is free then, so it renders a plain placeholder instead.
   */
  defaultSectionId?: string;
}) {
  const cellMap = new Map<string, EditableCellData>();
  for (const c of cells) cellMap.set(`${c.day_of_week}:${c.period_slot_id}`, c);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-brand-primary text-white">
            <th className="sticky left-0 bg-brand-primary px-3 py-2 font-medium">Period</th>
            {DAYS.map((day) => (
              <th key={day.value} className="px-3 py-2 font-medium">
                {day.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periodSlots.map((slot) => (
            <tr key={slot.id} className="border-t border-slate-100">
              <td className="sticky left-0 bg-white px-3 py-2 align-top">
                <div className="font-medium text-slate-700">{slot.label}</div>
                <div className="text-xs text-slate-400">
                  {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                </div>
              </td>
              {DAYS.map((day) => {
                const cell = cellMap.get(`${day.value}:${slot.id}`);
                const sectionId = cell?.section_id ?? defaultSectionId;
                return (
                  <td
                    key={day.value}
                    id={`cell-${day.value}-${slot.id}`}
                    className="min-w-[140px] px-1 py-1 align-top"
                  >
                    {sectionId ? (
                      <TimetableCell
                        sectionId={sectionId}
                        dayOfWeek={day.value}
                        periodSlotId={slot.id}
                        initialSubjectId={cell?.subject_id ?? null}
                        initialSubjectName={cell?.subject_name ?? null}
                        initialTeacherId={cell?.teacher_id ?? null}
                        initialTeacherName={cell?.teacher_name ?? null}
                        initialIsPractical={cell?.is_practical ?? false}
                        subjects={subjects}
                        teachers={teachers}
                        qualifiedTeacherIdsBySubject={qualifiedTeacherIdsBySubject}
                        sectionLabel={cell?.sectionLabel}
                        jumpHref={cell?.jumpHref}
                      />
                    ) : (
                      <div className="px-2 py-1 text-slate-300">Free</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
