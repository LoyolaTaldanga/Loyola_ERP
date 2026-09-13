import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/today";
import { getActiveSession } from "@/lib/session-context";
import { SubstituteRow } from "./substitute-row";
import type { AssignmentMethod, SubstitutionStatus } from "@/lib/supabase/types";

function classLabel(cls: { name: string; stream: string | null } | null): string {
  if (!cls) return "";
  return `${cls.name}${cls.stream ? ` (${cls.stream})` : ""}`;
}

const STATUS_RANK: Record<SubstitutionStatus, number> = {
  flagged_for_review: 0,
  pending: 1,
  assigned: 2,
  confirmed: 3,
  cancelled: 4,
};

export default async function SubstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "all" ? "all" : "needs-review";

  const supabase = await createClient();
  const today = todayISO();
  const activeSession = await getActiveSession(supabase);

  const { data: teachers } = await supabase
    .from("teachers")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const statusFilter: SubstitutionStatus[] =
    activeTab === "needs-review" ? ["pending", "flagged_for_review"] : ["pending", "flagged_for_review", "assigned", "confirmed"];

  const { data: subs, error } = await supabase
    .from("substitutions")
    .select(
      `id, date, status, assignment_method, is_exception_fallback, substitute_teacher_id, note,
       timetable_entries(day_of_week, period_slot_id, subjects(name), sections(name, classes(name, stream)), period_slots(period_number, label, start_time, end_time)),
       teacher_absences(id, teacher_id, teachers!teacher_absences_teacher_id_fkey(name)),
       substitute:teachers!substitutions_substitute_teacher_id_fkey(name)`
    )
    .in("status", statusFilter)
    .gte("date", today)
    .eq("session_id", activeSession.id)
    .order("date", { ascending: true });
  if (error) throw error;

  // Busy-map: which teachers already have a class at a given (day, period
  // slot) — used to warn (not block) when Admin overrides with someone who
  // isn't actually free. Paged: PostgREST caps a plain .select() at 1000 rows.
  const busyByDayPeriod = new Map<string, Set<string>>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: page, error: pageError } = await supabase
      .from("timetable_entries")
      .select("day_of_week, period_slot_id, teacher_id")
      .not("teacher_id", "is", null)
      .eq("session_id", activeSession.id)
      .range(from, from + pageSize - 1);
    if (pageError) throw pageError;
    for (const e of page ?? []) {
      const key = `${e.day_of_week}|${e.period_slot_id}`;
      const set = busyByDayPeriod.get(key) ?? new Set<string>();
      set.add(e.teacher_id!);
      busyByDayPeriod.set(key, set);
    }
    if (!page || page.length < pageSize) break;
  }

  const rows = (subs ?? [])
    .map((sub) => {
      const entry = sub.timetable_entries as unknown as {
        day_of_week: number;
        period_slot_id: string;
        subjects: { name: string } | null;
        sections: { name: string; classes: { name: string; stream: string | null } | null } | null;
        period_slots: { period_number: number; label: string; start_time: string; end_time: string };
      };
      const absence = sub.teacher_absences as unknown as {
        id: string;
        teacher_id: string;
        teachers: { name: string } | null;
      } | null;
      const substituteInfo = sub.substitute as unknown as { name: string } | null;

      const busyIds = busyByDayPeriod.get(`${entry.day_of_week}|${entry.period_slot_id}`) ?? new Set<string>();
      const eligible = (teachers ?? []).filter((t) => t.id !== absence?.teacher_id);
      const freeTeachers = eligible.filter((t) => !busyIds.has(t.id));
      const busyTeachers = eligible.filter((t) => busyIds.has(t.id));

      return {
        substitution: {
          id: sub.id,
          absenceId: absence?.id ?? null,
          date: sub.date,
          periodLabel: `${entry.period_slots.label} (${entry.period_slots.start_time.slice(0, 5)}–${entry.period_slots.end_time.slice(0, 5)})`,
          sectionLabel: entry.sections ? `${classLabel(entry.sections.classes)} — ${entry.sections.name}` : "",
          subjectName: entry.subjects?.name ?? null,
          absentTeacherName: absence?.teachers?.name ?? "Unknown",
          status: sub.status,
          assignmentMethod: sub.assignment_method as AssignmentMethod,
          isExceptionFallback: sub.is_exception_fallback,
          substituteTeacherName: substituteInfo?.name ?? null,
          note: sub.note,
        },
        freeTeachers,
        busyTeachers,
        sortKey: STATUS_RANK[sub.status as SubstitutionStatus],
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey || a.substitution.date.localeCompare(b.substitution.date));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Substitutions</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Auto-assigned by the engine where possible. Overriding with a teacher who already has a
        class then is allowed, but flagged.
      </p>

      <div className="mt-4 flex gap-2">
        <Link
          href="/admin/substitutions?tab=needs-review"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            activeTab === "needs-review" ? "bg-brand-primary text-white" : "bg-white text-slate-600 border border-slate-300"
          }`}
        >
          Needs Review
        </Link>
        <Link
          href="/admin/substitutions?tab=all"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            activeTab === "all" ? "bg-brand-primary text-white" : "bg-white text-slate-600 border border-slate-300"
          }`}
        >
          All
        </Link>
        {rows.some((r) => r.substitution.date === today) && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-brand-neutral">Download all for today:</span>
            <a
              href={`/api/substitutions/day/${today}?format=xlsx`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-600"
            >
              Excel
            </a>
            <a
              href={`/api/substitutions/day/${today}?format=pdf`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-600"
            >
              PDF
            </a>
          </div>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Period</th>
              <th className="px-3 py-2 font-medium">Class / Subject</th>
              <th className="px-3 py-2 font-medium">Absent teacher</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Override</th>
              <th className="px-3 py-2 font-medium">Slip</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ substitution, freeTeachers, busyTeachers }) => (
              <SubstituteRow
                key={substitution.id}
                substitution={substitution}
                freeTeachers={freeTeachers}
                busyTeachers={busyTeachers}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {activeTab === "needs-review" ? "Nothing needs review." : "No substitutions found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
