"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AbsenceStatus, LeaveType } from "@/lib/supabase/types";
import { createAbsenceAndAssign } from "@/lib/create-absence";
import { getActiveSession } from "@/lib/session-context";
import { suggestLeaveSplit } from "@/lib/leave-quota";

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
  const leaveTypeRaw = String(formData.get("leaveType") ?? "");
  const leaveType: LeaveType | null = leaveTypeRaw === "casual" || leaveTypeRaw === "paid" ? leaveTypeRaw : null;

  if (!teacherId || !date || (status !== "full_day" && status !== "partial")) {
    return { error: "Pick a teacher, date, and full-day/partial.", success: null };
  }
  if (status === "partial" && periodSlotIds.length === 0) {
    return { error: "Pick at least one period for a partial-day absence.", success: null };
  }

  const admin = createAdminClient();
  const activeSession = await getActiveSession(admin);

  const result = await createAbsenceAndAssign(admin, {
    teacherId,
    date,
    status,
    periodSlotIds,
    notes,
    sessionId: activeSession.id,
    leaveType,
  });
  if (result.error) return { error: result.error, success: null };

  revalidatePath("/admin");
  revalidatePath("/admin/absences");
  revalidatePath("/admin/substitutions");
  revalidatePath("/dashboard");

  const parts = [
    result.assignedCount > 0 ? `${result.assignedCount} auto-assigned` : null,
    result.flaggedCount > 0 ? `${result.flaggedCount} flagged for review` : null,
    result.noCandidateCount > 0 ? `${result.noCandidateCount} with no candidate available` : null,
    result.revertedCount > 0 ? `${result.revertedCount} of their existing substitute duties re-assigned` : null,
  ].filter(Boolean);

  return {
    error: null,
    success: `Marked absent for ${date} — ${result.periodsProcessed} period(s) processed: ${parts.join(", ")}.`,
  };
}

export async function previewAbsenceLeaveType(
  teacherId: string,
  date: string
): Promise<{ error: string | null; suggestedType: LeaveType | null }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized.", suggestedType: null };
  if (!teacherId || !date) return { error: "Missing teacher or date.", suggestedType: null };

  const admin = createAdminClient();
  const [suggestion] = await suggestLeaveSplit(admin, teacherId, [date]);
  return { error: null, suggestedType: suggestion.suggestedType };
}
