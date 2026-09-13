import { getCurrentUser } from "@/lib/auth/get-role";
import { createClient } from "@/lib/supabase/server";
import { TimetableTable, type TimetableCellData } from "@/components/timetable-table";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { todayISO } from "@/lib/today";
import { getActiveSession } from "@/lib/session-context";
import { getTeacherLeaveSummary } from "@/lib/leave-quota";
import { LeaveSummaryCard } from "@/components/leave-summary-card";

function classLabel(cls: { name: string; stream: string | null } | null): string {
  if (!cls) return "";
  return `${cls.name}${cls.stream ? ` (${cls.stream})` : ""}`;
}

export default async function DashboardPage() {
  const current = await getCurrentUser();
  const supabase = await createClient();
  // Teachers only ever see the currently active session — never a
  // draft/archived one, regardless of what an admin happens to be viewing.
  const activeSession = await getActiveSession(supabase);

  const { data: teacher } = await supabase
    .from("teachers")
    .select("name")
    .eq("id", current!.user.id)
    .single();

  const year = new Date().getFullYear();
  const leaveSummary = await getTeacherLeaveSummary(supabase, current!.user.id, year);

  const { data: periodSlots } = await supabase
    .from("period_slots")
    .select("*")
    .order("period_number", { ascending: true });

  const { data: entries } = await supabase
    .from("timetable_entries")
    .select("day_of_week, period_slot_id, is_practical, subjects(name), sections(name, classes(name, stream))")
    .eq("teacher_id", current!.user.id)
    .eq("session_id", activeSession.id);

  const cells: TimetableCellData[] = (entries ?? []).map((e) => {
    const section = e.sections as unknown as { name: string; classes: { name: string; stream: string | null } | null } | null;
    return {
      day_of_week: e.day_of_week,
      period_slot_id: e.period_slot_id,
      subject_name: (e.subjects as unknown as { name: string } | null)?.name ?? null,
      sub_label: section ? `${classLabel(section.classes)} ${section.name}`.trim() : null,
      is_practical: e.is_practical,
    };
  });

  const { data: dutyToday } = await supabase
    .from("substitutions")
    .select(
      `id, absence_id, timetable_entries(subjects(name), sections(name, classes(name, stream)), period_slots(label, start_time, end_time)),
       teacher_absences(teacher_id, teachers!teacher_absences_teacher_id_fkey(name))`
    )
    .eq("substitute_teacher_id", current!.user.id)
    .eq("date", todayISO())
    .eq("session_id", activeSession.id)
    .in("status", ["assigned", "confirmed"]);

  const duties = (dutyToday ?? []).map((d) => {
    const entry = d.timetable_entries as unknown as {
      subjects: { name: string } | null;
      sections: { name: string; classes: { name: string; stream: string | null } | null } | null;
      period_slots: { label: string; start_time: string; end_time: string };
    };
    const absence = d.teacher_absences as unknown as { teachers: { name: string } | null } | null;
    return {
      id: d.id,
      absenceId: d.absence_id,
      periodLabel: `${entry.period_slots.label} (${entry.period_slots.start_time.slice(0, 5)}–${entry.period_slots.end_time.slice(0, 5)})`,
      sectionLabel: entry.sections ? `${classLabel(entry.sections.classes)} — ${entry.sections.name}` : "",
      subjectName: entry.subjects?.name ?? null,
      absentTeacherName: absence?.teachers?.name ?? "a teacher",
    };
  });

  const slipsToDownload = [
    ...new Map(duties.map((d) => [d.absenceId, d.absentTeacherName])).entries(),
  ].map(([absenceId, absentTeacherName]) => ({ absenceId, absentTeacherName }));

  const { data: classTeacherSections } = await supabase
    .from("sections")
    .select("id, name, classes(name, stream)")
    .eq("class_teacher_id", current!.user.id)
    .eq("session_id", activeSession.id);

  const classSectionGrids = await Promise.all(
    (classTeacherSections ?? []).map(async (section) => {
      const { data: sectionEntries } = await supabase
        .from("timetable_entries")
        .select("day_of_week, period_slot_id, is_practical, subjects(name), teachers(name)")
        .eq("section_id", section.id)
        .eq("session_id", activeSession.id);

      const sectionCells: TimetableCellData[] = (sectionEntries ?? []).map((e) => ({
        day_of_week: e.day_of_week,
        period_slot_id: e.period_slot_id,
        subject_name: (e.subjects as unknown as { name: string } | null)?.name ?? null,
        sub_label: (e.teachers as unknown as { name: string } | null)?.name ?? null,
        is_practical: e.is_practical,
      }));

      const cls = section.classes as unknown as { name: string; stream: string | null } | null;
      return { id: section.id, label: `${classLabel(cls)} — ${section.name}`, cells: sectionCells };
    })
  );

  return (
    <div>
      <RefreshOnFocus />
      <h1 className="text-2xl font-semibold text-brand-primary">
        Welcome, {teacher?.name ?? "Teacher"}
      </h1>

      <div className="mt-6">
        <LeaveSummaryCard summary={leaveSummary} year={year} />
      </div>

      {duties.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <h2 className="font-semibold text-amber-900">Substitution Duty Today</h2>
          <ul className="mt-2 space-y-2">
            {duties.map((d) => (
              <li key={d.id} className="text-sm text-amber-900">
                <span className="font-medium">{d.periodLabel}</span> — {d.sectionLabel} (
                {d.subjectName ?? "no subject"}), covering for {d.absentTeacherName}
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1">
            {slipsToDownload.map((s) => (
              <div key={s.absenceId} className="flex items-center gap-2 text-xs text-amber-900">
                <span>Slip for {s.absentTeacherName}:</span>
                <a href={`/api/substitutions/absence/${s.absenceId}?format=xlsx`} className="underline">
                  Excel
                </a>
                <a href={`/api/substitutions/absence/${s.absenceId}?format=pdf`} className="underline">
                  PDF
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-brand-primary">Your Teaching Schedule</h2>
          <a
            href={`/api/teachers/${current!.user.id}/timetable`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600"
          >
            Download Excel
          </a>
        </div>
        <TimetableTable periodSlots={periodSlots ?? []} cells={cells} />
      </div>

      {classSectionGrids.map((grid) => (
        <div key={grid.id} className="mt-8">
          <h2 className="mb-2 font-semibold text-brand-primary">Your Class: {grid.label} — full timetable</h2>
          <p className="mb-2 text-xs text-slate-500">Read-only — every period for this section, not just yours.</p>
          <TimetableTable periodSlots={periodSlots ?? []} cells={grid.cells} />
        </div>
      ))}
    </div>
  );
}
