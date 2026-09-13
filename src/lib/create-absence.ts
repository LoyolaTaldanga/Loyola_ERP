import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, AbsenceStatus, LeaveType } from "./supabase/types";
import { autoAssignAndSave } from "./substitution-engine";
import { notifySubstituteIfVerified } from "./notify-substitute";
import { revertExistingSubstituteDuty } from "./revert-substitute-duty";

type Client = SupabaseClient<Database>;

export interface CreateAbsenceInput {
  teacherId: string;
  date: string; // YYYY-MM-DD
  status: AbsenceStatus;
  periodSlotIds?: string[]; // required when status === "partial"
  notes?: string | null;
  leaveRequestId?: string | null;
  // Only meaningful when status === "full_day" — left null for partial-day
  // marks, which never consume annual leave in this phase.
  leaveType?: LeaveType | null;
  // The currently active session — absences/substitutions are always real,
  // dated events against whatever's currently live, never a draft/archived
  // one. Callers resolve this themselves (this module can't read cookies).
  sessionId: string;
}

export interface CreateAbsenceResult {
  error: string | null;
  // Non-fatal: the caller (e.g. a multi-date approval loop) decides how to
  // report a skipped date rather than treating it as a hard failure.
  skipped?: "weekend" | "already-marked" | "no-periods";
  periodsProcessed: number;
  assignedCount: number;
  flaggedCount: number;
  noCandidateCount: number;
  revertedCount: number;
}

const EMPTY_RESULT_COUNTS = { periodsProcessed: 0, assignedCount: 0, flaggedCount: 0, noCandidateCount: 0, revertedCount: 0 };

/**
 * Creates a teacher_absences row for one date, upserts a substitutions row
 * per affected period, and runs the auto-assignment engine over all of them
 * (plus reverting any existing duty this teacher was covering elsewhere that
 * day). Shared by the admin's direct "mark absent" flow and the leave-request
 * approval flow (which calls this once per date in the requested range) —
 * see src/app/admin/absences/actions.ts and src/app/admin/leave-requests/actions.ts.
 */
export async function createAbsenceAndAssign(admin: Client, input: CreateAbsenceInput): Promise<CreateAbsenceResult> {
  const { teacherId, date, status, notes = null, leaveRequestId = null, sessionId } = input;
  const leaveType = status === "full_day" ? (input.leaveType ?? null) : null;
  const periodSlotIds = input.periodSlotIds ?? [];

  if (status === "partial" && periodSlotIds.length === 0) {
    return { error: "Pick at least one period for a partial-day absence.", ...EMPTY_RESULT_COUNTS };
  }

  // JS Date.getDay(): Sunday=0 .. Saturday=6, which lines up exactly with
  // this schema's day_of_week (Monday=1 .. Friday=5) for weekdays.
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  if (dayOfWeek < 1 || dayOfWeek > 5) {
    return { error: "That date falls on a weekend — there's no timetable for it.", skipped: "weekend", ...EMPTY_RESULT_COUNTS };
  }

  const { count: existingCount } = await admin
    .from("teacher_absences")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", teacherId)
    .eq("date", date)
    .eq("session_id", sessionId);
  if ((existingCount ?? 0) > 0) {
    return {
      error: "This teacher is already marked absent on that date. Manage it from the Substitutions page.",
      skipped: "already-marked",
      ...EMPTY_RESULT_COUNTS,
    };
  }

  const { data: dayEntries, error: entriesError } = await admin
    .from("timetable_entries")
    .select("id, period_slot_id, period_slots(period_number)")
    .eq("teacher_id", teacherId)
    .eq("day_of_week", dayOfWeek)
    .eq("session_id", sessionId);
  if (entriesError) return { error: entriesError.message, ...EMPTY_RESULT_COUNTS };
  if (!dayEntries || dayEntries.length === 0) {
    return { error: "This teacher has no periods scheduled on that day.", skipped: "no-periods", ...EMPTY_RESULT_COUNTS };
  }

  const targetEntries =
    status === "full_day" ? dayEntries : dayEntries.filter((e) => periodSlotIds.includes(e.period_slot_id));
  if (targetEntries.length === 0) {
    return { error: "None of the selected periods belong to this teacher on that day.", ...EMPTY_RESULT_COUNTS };
  }

  const affectedPeriods =
    status === "partial"
      ? targetEntries.map((e) => (e.period_slots as unknown as { period_number: number }).period_number)
      : null;

  const { data: absence, error: absenceError } = await admin
    .from("teacher_absences")
    .insert({
      teacher_id: teacherId,
      date,
      status,
      affected_periods: affectedPeriods,
      notes,
      leave_request_id: leaveRequestId,
      session_id: sessionId,
      leave_type: leaveType,
    })
    .select("id")
    .single();
  if (absenceError || !absence) return { error: absenceError?.message ?? "Could not save the absence.", ...EMPTY_RESULT_COUNTS };

  const subInserts = targetEntries.map((e) => ({
    absence_id: absence.id,
    timetable_entry_id: e.id,
    date,
    status: "pending" as const,
    assignment_method: "manual" as const,
    session_id: sessionId,
  }));
  const { data: newSubs, error: subError } = await admin
    .from("substitutions")
    .upsert(subInserts, { onConflict: "timetable_entry_id,date" })
    .select("id");
  if (subError) return { error: subError.message, ...EMPTY_RESULT_COUNTS };

  // This teacher might already be someone else's assigned substitute today,
  // for a period that now falls within their own new absence — that
  // assignment is no longer valid. Reset it to pending so the engine below
  // picks a replacement, rather than leaving an absent teacher listed as a
  // substitute.
  const toRevertIds = await revertExistingSubstituteDuty(admin, teacherId, date, affectedPeriods, sessionId);

  const allTargetIds = [...(newSubs ?? []).map((s) => s.id), ...toRevertIds];

  let assignedCount = 0;
  let flaggedCount = 0;
  let noCandidateCount = 0;
  for (const id of allTargetIds) {
    const result = await autoAssignAndSave(admin, id);
    if (result.status === "assigned") assignedCount++;
    else if (result.status === "flagged_for_review") flaggedCount++;
    else noCandidateCount++;
    if (result.substituteTeacherId) {
      await notifySubstituteIfVerified(admin, id, result.substituteTeacherId);
    }
  }

  return {
    error: null,
    periodsProcessed: targetEntries.length,
    assignedCount,
    flaggedCount,
    noCandidateCount,
    revertedCount: toRevertIds.length,
  };
}
