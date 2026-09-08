"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AbsenceStatus } from "@/lib/supabase/types";
import { autoAssignAndSave } from "@/lib/substitution-engine";
import { notifySubstituteIfVerified } from "@/lib/notify-substitute";
import { revertExistingSubstituteDuty } from "@/lib/revert-substitute-duty";

export interface MarkAbsenceState {
  error: string | null;
  success: string | null;
}

export async function markAbsence(
  _prevState: MarkAbsenceState,
  formData: FormData
): Promise<MarkAbsenceState> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return { error: "Not authorized.", success: null };
  }

  const teacherId = String(formData.get("teacherId") ?? "");
  const date = String(formData.get("date") ?? "");
  const status = String(formData.get("status") ?? "") as AbsenceStatus;
  const periodSlotIds = formData.getAll("periodSlotIds").map(String);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!teacherId || !date || (status !== "full_day" && status !== "partial")) {
    return { error: "Pick a teacher, date, and full-day/partial.", success: null };
  }
  if (status === "partial" && periodSlotIds.length === 0) {
    return { error: "Pick at least one period for a partial-day absence.", success: null };
  }

  // JS Date.getDay(): Sunday=0 .. Saturday=6, which lines up exactly with
  // this schema's day_of_week (Monday=1 .. Friday=5) for weekdays.
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  if (dayOfWeek < 1 || dayOfWeek > 5) {
    return { error: "That date falls on a weekend — there's no timetable for it.", success: null };
  }

  const admin = createAdminClient();

  const { count: existingCount } = await admin
    .from("teacher_absences")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", teacherId)
    .eq("date", date);
  if ((existingCount ?? 0) > 0) {
    return {
      error: "This teacher is already marked absent on that date. Manage it from the Substitutions page.",
      success: null,
    };
  }

  const { data: dayEntries, error: entriesError } = await admin
    .from("timetable_entries")
    .select("id, period_slot_id, period_slots(period_number)")
    .eq("teacher_id", teacherId)
    .eq("day_of_week", dayOfWeek);
  if (entriesError) return { error: entriesError.message, success: null };
  if (!dayEntries || dayEntries.length === 0) {
    return { error: "This teacher has no periods scheduled on that day.", success: null };
  }

  const targetEntries =
    status === "full_day" ? dayEntries : dayEntries.filter((e) => periodSlotIds.includes(e.period_slot_id));
  if (targetEntries.length === 0) {
    return { error: "None of the selected periods belong to this teacher on that day.", success: null };
  }

  const affectedPeriods =
    status === "partial"
      ? targetEntries.map((e) => (e.period_slots as unknown as { period_number: number }).period_number)
      : null;

  const { data: absence, error: absenceError } = await admin
    .from("teacher_absences")
    .insert({ teacher_id: teacherId, date, status, affected_periods: affectedPeriods, notes })
    .select("id")
    .single();
  if (absenceError || !absence) return { error: absenceError?.message ?? "Could not save the absence.", success: null };

  const subInserts = targetEntries.map((e) => ({
    absence_id: absence.id,
    timetable_entry_id: e.id,
    date,
    status: "pending" as const,
    assignment_method: "manual" as const,
  }));
  const { data: newSubs, error: subError } = await admin
    .from("substitutions")
    .upsert(subInserts, { onConflict: "timetable_entry_id,date" })
    .select("id");
  if (subError) return { error: subError.message, success: null };

  // This teacher might already be someone else's assigned substitute today,
  // for a period that now falls within their own new absence — that
  // assignment is no longer valid. Reset it to pending so the engine below
  // picks a replacement, rather than leaving an absent teacher listed as a
  // substitute.
  const toRevertIds = await revertExistingSubstituteDuty(admin, teacherId, date, affectedPeriods);

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

  revalidatePath("/admin");
  revalidatePath("/admin/absences");
  revalidatePath("/admin/substitutions");
  revalidatePath("/dashboard");

  const parts = [
    assignedCount > 0 ? `${assignedCount} auto-assigned` : null,
    flaggedCount > 0 ? `${flaggedCount} flagged for review` : null,
    noCandidateCount > 0 ? `${noCandidateCount} with no candidate available` : null,
    toRevertIds.length > 0 ? `${toRevertIds.length} of their existing substitute duties re-assigned` : null,
  ].filter(Boolean);

  return {
    error: null,
    success: `Marked absent for ${date} — ${targetEntries.length} period(s) processed: ${parts.join(", ")}.`,
  };
}
