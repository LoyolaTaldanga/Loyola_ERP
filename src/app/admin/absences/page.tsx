import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/today";
import { getActiveSession } from "@/lib/session-context";
import { AbsenceForm, type TeacherPeriodEntry } from "./absence-form";

function classLabel(cls: { name: string; stream: string | null } | null): string {
  if (!cls) return "";
  return `${cls.name}${cls.stream ? ` (${cls.stream})` : ""}`;
}

export default async function AbsencesPage() {
  const supabase = await createClient();
  const activeSession = await getActiveSession(supabase);

  const { data: teachers } = await supabase
    .from("teachers")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  // PostgREST caps a plain .select() at 1000 rows — this table has ~1900,
  // so page through it (see the same lesson learned in the Part 3 linking
  // utility).
  const entriesByTeacherAndDay: Record<string, Record<number, TeacherPeriodEntry[]>> = {};
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from("timetable_entries")
      .select(
        "teacher_id, day_of_week, period_slot_id, subjects(name), sections(name, classes(name, stream)), period_slots(period_number, label, start_time, end_time)"
      )
      .not("teacher_id", "is", null)
      .eq("session_id", activeSession.id)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const e of page ?? []) {
      const teacherId = e.teacher_id!;
      const periodSlot = e.period_slots as unknown as {
        period_number: number;
        label: string;
        start_time: string;
        end_time: string;
      };
      const section = e.sections as unknown as { name: string; classes: { name: string; stream: string | null } | null } | null;
      const subject = e.subjects as unknown as { name: string } | null;

      (entriesByTeacherAndDay[teacherId] ??= {});
      (entriesByTeacherAndDay[teacherId][e.day_of_week] ??= []).push({
        periodSlotId: e.period_slot_id,
        periodNumber: periodSlot.period_number,
        periodLabel: `${periodSlot.label} (${periodSlot.start_time.slice(0, 5)}–${periodSlot.end_time.slice(0, 5)})`,
        sectionLabel: section ? `${classLabel(section.classes)} — ${section.name}` : "",
        subjectName: subject?.name ?? null,
      });
    }
    if (!page || page.length < pageSize) break;
  }

  for (const teacherId of Object.keys(entriesByTeacherAndDay)) {
    for (const day of Object.keys(entriesByTeacherAndDay[teacherId])) {
      entriesByTeacherAndDay[teacherId][Number(day)].sort((a, b) => a.periodNumber - b.periodNumber);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Absences</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Mark a teacher absent — full day or specific periods. This creates a pending substitution
        for each affected period.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <AbsenceForm
          teachers={teachers ?? []}
          entriesByTeacherAndDay={entriesByTeacherAndDay}
          defaultDate={todayISO()}
        />
      </div>
    </div>
  );
}
