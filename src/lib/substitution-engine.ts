import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SubstitutionStatus } from "./supabase/types";
import { gradeBandForClassName } from "./grade-band";

// No "server-only" import here on purpose — the engine takes a Supabase
// client rather than constructing one itself, so it has no dependency that
// would break when imported from a plain script (see the Phase 2 lesson:
// "server-only" throws unconditionally outside a webpack bundle). That also
// makes it directly unit-testable against a real database connection.
type Client = SupabaseClient<Database>;

export interface AutoAssignResult {
  status: SubstitutionStatus;
  substituteTeacherId: string | null;
  isExceptionFallback: boolean;
  note: string | null;
}

interface RuleRow {
  priority_order: number;
  is_active: boolean;
  config: Record<string, unknown>;
}

async function loadRules(client: Client): Promise<Record<string, RuleRow>> {
  const { data } = await client.from("substitution_rules").select("rule_key, priority_order, is_active, config");
  const map: Record<string, RuleRow> = {};
  for (const r of data ?? []) {
    map[r.rule_key] = {
      priority_order: r.priority_order,
      is_active: r.is_active,
      config: (r.config ?? {}) as Record<string, unknown>,
    };
  }
  return map;
}

/**
 * Runs the auto-assignment algorithm for one substitution row and returns
 * the outcome — it does NOT write to the database itself, so callers can
 * decide what to do with the result (the caller also owns updating the row).
 */
export async function computeAutoAssignment(client: Client, substitutionId: string): Promise<AutoAssignResult> {
  const { data: sub, error } = await client
    .from("substitutions")
    .select(
      `id, date,
       timetable_entries(day_of_week, period_slot_id, subject_id,
         sections(classes(name)),
         subjects(category),
         period_slots(period_number)),
       teacher_absences(teacher_id)`
    )
    .eq("id", substitutionId)
    .single();
  if (error || !sub) {
    return { status: "pending", substituteTeacherId: null, isExceptionFallback: false, note: "Substitution not found." };
  }

  const entry = sub.timetable_entries as unknown as {
    day_of_week: number;
    period_slot_id: string;
    subject_id: string | null;
    sections: { classes: { name: string } | null } | null;
    subjects: { category: "academic" | "games" } | null;
    period_slots: { period_number: number } | null;
  };
  const absence = sub.teacher_absences as unknown as { teacher_id: string };
  const absentTeacherId = absence.teacher_id;
  const dayOfWeek = entry.day_of_week;
  const periodSlotId = entry.period_slot_id;
  const periodNumber = entry.period_slots?.period_number ?? null;
  const subjectId = entry.subject_id;
  const subjectCategory = entry.subjects?.category ?? "academic";
  const targetGroup = gradeBandForClassName(entry.sections?.classes?.name ?? "");
  const date = sub.date;

  const rules = await loadRules(client);
  const minFreePeriods = Number(rules["min_free_periods_same_subject"]?.config?.min_free_periods ?? 2);
  const ptGamesActive = rules["pt_games_restriction"]?.is_active ?? true;
  const groupPreferenceActive = rules["group_preference"]?.is_active ?? true;
  const workloadTiebreakActive = rules["workload_tiebreak"]?.is_active ?? true;
  const groupPriority = rules["group_preference"]?.priority_order ?? 3;
  const workloadPriority = rules["workload_tiebreak"]?.priority_order ?? 4;

  const { data: activeTeachers } = await client.from("teachers").select("id, name, group").eq("is_active", true);
  const teacherById = new Map((activeTeachers ?? []).map((t) => [t.id, t]));

  // Busy at this exact (day, period_slot) — has a regular timetable_entries row there.
  const { data: busyRows } = await client
    .from("timetable_entries")
    .select("teacher_id")
    .eq("day_of_week", dayOfWeek)
    .eq("period_slot_id", periodSlotId)
    .not("teacher_id", "is", null);
  const busyAtSlot = new Set((busyRows ?? []).map((r) => r.teacher_id!));

  // Teachers absent today, at this specific period (full_day = every period; partial = only their listed periods).
  const { data: absencesToday } = await client
    .from("teacher_absences")
    .select("teacher_id, status, affected_periods")
    .eq("date", date);
  const absentAtThisPeriod = new Set<string>();
  for (const a of absencesToday ?? []) {
    if (a.status === "full_day") absentAtThisPeriod.add(a.teacher_id);
    else if (periodNumber !== null && (a.affected_periods ?? []).includes(periodNumber)) absentAtThisPeriod.add(a.teacher_id);
  }

  // All of today's substitute assignments — used both to exclude teachers
  // already subbing at this exact slot, and to tally today's total workload.
  const { data: subsToday } = await client
    .from("substitutions")
    .select("substitute_teacher_id, timetable_entries(period_slot_id)")
    .eq("date", date)
    .not("substitute_teacher_id", "is", null)
    .in("status", ["assigned", "confirmed", "flagged_for_review"]);
  const alreadySubbingAtSlot = new Set<string>();
  const substituteCountToday = new Map<string, number>();
  for (const s of subsToday ?? []) {
    if (!s.substitute_teacher_id) continue;
    substituteCountToday.set(s.substitute_teacher_id, (substituteCountToday.get(s.substitute_teacher_id) ?? 0) + 1);
    const slotId = (s.timetable_entries as unknown as { period_slot_id: string } | null)?.period_slot_id;
    if (slotId === periodSlotId) alreadySubbingAtSlot.add(s.substitute_teacher_id);
  }

  const { data: teacherSubjectRows } = await client.from("teacher_subjects").select("teacher_id, subject_id, subjects(category)");
  const subjectsByTeacher = new Map<string, { subjectId: string; category: string }[]>();
  for (const ts of teacherSubjectRows ?? []) {
    const category = (ts.subjects as unknown as { category: string } | null)?.category ?? "academic";
    const arr = subjectsByTeacher.get(ts.teacher_id) ?? [];
    arr.push({ subjectId: ts.subject_id, category });
    subjectsByTeacher.set(ts.teacher_id, arr);
  }

  // --- Step 1: candidate pool ------------------------------------------------
  let pool = (activeTeachers ?? []).filter(
    (t) =>
      t.id !== absentTeacherId &&
      !busyAtSlot.has(t.id) &&
      !absentAtThisPeriod.has(t.id) &&
      !alreadySubbingAtSlot.has(t.id)
  );

  if (ptGamesActive) {
    if (subjectCategory === "games") {
      pool = pool.filter((t) => (subjectsByTeacher.get(t.id) ?? []).some((s) => s.category === "games"));
    } else {
      pool = pool.filter((t) => {
        const subs = subjectsByTeacher.get(t.id) ?? [];
        if (subs.length === 0) return true; // no recorded specialization — not excluded
        return !subs.every((s) => s.category === "games"); // exclude games-only teachers
      });
    }
  }

  if (pool.length === 0) {
    return { status: "pending", substituteTeacherId: null, isExceptionFallback: false, note: "No candidate available." };
  }

  // Total free periods across the whole day (real teaching periods 0-8 only,
  // not Assembly/Recess/Dispersal) — a stable measure of the teacher's own
  // slack, unaffected by today's in-flight substitution assignments.
  const { data: teacherDayEntries } = await client
    .from("timetable_entries")
    .select("teacher_id")
    .eq("day_of_week", dayOfWeek)
    .not("teacher_id", "is", null);
  const busyCountByTeacher = new Map<string, number>();
  for (const e of teacherDayEntries ?? []) {
    busyCountByTeacher.set(e.teacher_id!, (busyCountByTeacher.get(e.teacher_id!) ?? 0) + 1);
  }
  const { count: totalDayPeriods } = await client
    .from("period_slots")
    .select("id", { count: "exact", head: true })
    .gte("period_number", 0)
    .lte("period_number", 8);

  function freePeriodsForTeacher(teacherId: string): number {
    return (totalDayPeriods ?? 9) - (busyCountByTeacher.get(teacherId) ?? 0);
  }
  function workloadForTeacher(teacherId: string): number {
    return (busyCountByTeacher.get(teacherId) ?? 0) + (substituteCountToday.get(teacherId) ?? 0);
  }

  const rankedCriteria: { priority: number; cmp: (x: string, y: string) => number }[] = [];
  if (groupPreferenceActive) {
    rankedCriteria.push({
      priority: groupPriority,
      cmp: (x, y) => {
        const gx = teacherById.get(x)?.group === targetGroup ? 0 : 1;
        const gy = teacherById.get(y)?.group === targetGroup ? 0 : 1;
        return gx - gy;
      },
    });
  }
  if (workloadTiebreakActive) {
    rankedCriteria.push({ priority: workloadPriority, cmp: (x, y) => workloadForTeacher(x) - workloadForTeacher(y) });
  }
  rankedCriteria.sort((a, b) => a.priority - b.priority);

  function rankCompare(a: { id: string }, b: { id: string }): number {
    for (const c of rankedCriteria) {
      const r = c.cmp(a.id, b.id);
      if (r !== 0) return r;
    }
    return a.id.localeCompare(b.id); // deterministic, arbitrary tiebreak of last resort
  }

  // --- Step 2: primary path (subject-qualified, enough free periods) --------
  let step2Pool = subjectId ? pool.filter((t) => (subjectsByTeacher.get(t.id) ?? []).some((s) => s.subjectId === subjectId)) : [];
  step2Pool = step2Pool.filter((t) => freePeriodsForTeacher(t.id) >= minFreePeriods);

  if (step2Pool.length > 0) {
    const chosen = [...step2Pool].sort(rankCompare)[0];
    return { status: "assigned", substituteTeacherId: chosen.id, isExceptionFallback: false, note: null };
  }

  // --- Step 3: fallback (any eligible teacher from the full pool) -----------
  const chosen = [...pool].sort(rankCompare)[0];
  return { status: "flagged_for_review", substituteTeacherId: chosen.id, isExceptionFallback: true, note: null };
}

/** Runs computeAutoAssignment and writes the result onto the substitutions row. */
export async function autoAssignAndSave(client: Client, substitutionId: string): Promise<AutoAssignResult> {
  const result = await computeAutoAssignment(client, substitutionId);
  await client
    .from("substitutions")
    .update({
      status: result.status,
      substitute_teacher_id: result.substituteTeacherId,
      assignment_method: "auto",
      is_exception_fallback: result.isExceptionFallback,
      note: result.note,
    })
    .eq("id", substitutionId);
  return result;
}
