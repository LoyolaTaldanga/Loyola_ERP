"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAbsenceAndAssign } from "@/lib/create-absence";
import { assertSessionIsActive } from "@/lib/session-context";
import { dateRange, suggestLeaveSplit, type DateLeaveSuggestion } from "@/lib/leave-quota";
import type { LeaveType } from "@/lib/supabase/types";

export interface LeaveActionResult {
  error: string | null;
  success: string | null;
}

function revalidateAll() {
  revalidatePath("/admin");
  revalidatePath("/admin/leave-requests");
  revalidatePath("/admin/absences");
  revalidatePath("/admin/substitutions");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leave");
}

export async function previewLeaveApproval(id: string): Promise<{ error: string | null; suggestions: DateLeaveSuggestion[] }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized.", suggestions: [] };

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("leave_requests")
    .select("teacher_id, start_date, end_date, status")
    .eq("id", id)
    .single();
  if (!request) return { error: "Leave request not found.", suggestions: [] };
  if (request.status !== "pending") return { error: "Only a pending request can be previewed.", suggestions: [] };

  const dates = dateRange(request.start_date, request.end_date);
  const suggestions = await suggestLeaveSplit(admin, request.teacher_id, dates);
  return { error: null, suggestions };
}

export async function approveLeaveRequest(
  id: string,
  leaveTypeByDate: Record<string, LeaveType>
): Promise<LeaveActionResult> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized.", success: null };

  const admin = createAdminClient();

  const { data: request, error: requestError } = await admin
    .from("leave_requests")
    .select("id, teacher_id, start_date, end_date, status, session_id")
    .eq("id", id)
    .single();
  if (requestError || !request) return { error: "Leave request not found.", success: null };
  if (request.status !== "pending") return { error: "Only a pending request can be approved.", success: null };

  // Catches the edge case where this request sat pending across an Activate
  // cutover — its session may no longer be the live one.
  try {
    await assertSessionIsActive(admin, request.session_id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "This request's session is no longer active.", success: null };
  }

  const dates = dateRange(request.start_date, request.end_date);
  let assignedCount = 0;
  let flaggedCount = 0;
  let noCandidateCount = 0;
  let processedDates = 0;
  const skipped: string[] = [];

  for (const date of dates) {
    const result = await createAbsenceAndAssign(admin, {
      teacherId: request.teacher_id,
      date,
      status: "full_day",
      leaveRequestId: request.id,
      sessionId: request.session_id,
      leaveType: leaveTypeByDate[date] ?? "paid",
    });
    if (result.error) {
      skipped.push(`${date} (${result.error})`);
      continue;
    }
    processedDates++;
    assignedCount += result.assignedCount;
    flaggedCount += result.flaggedCount;
    noCandidateCount += result.noCandidateCount;
  }

  if (processedDates === 0) {
    return {
      error: `Could not approve — every date was skipped: ${skipped.join("; ")}`,
      success: null,
    };
  }

  // reviewed_by stays null: the Principal (admin) has no `teachers` row in
  // this schema (see init_schema.sql's header comment), the same reason
  // teacher_absences.reported_by/substitutions.created_by are already left
  // null for every admin-initiated action — setting it to the admin's auth
  // uid here would violate the teachers FK.
  const { error: updateError } = await admin
    .from("leave_requests")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) return { error: updateError.message, success: null };

  revalidateAll();

  const parts = [
    `${processedDates}/${dates.length} day(s) processed`,
    assignedCount > 0 ? `${assignedCount} auto-assigned` : null,
    flaggedCount > 0 ? `${flaggedCount} flagged for review` : null,
    noCandidateCount > 0 ? `${noCandidateCount} with no candidate available` : null,
    skipped.length > 0 ? `skipped: ${skipped.join("; ")}` : null,
  ].filter(Boolean);

  return { error: null, success: `Approved — ${parts.join(", ")}.` };
}

export async function rejectLeaveRequest(id: string): Promise<LeaveActionResult> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized.", success: null };

  const admin = createAdminClient();

  const { data: request } = await admin.from("leave_requests").select("status").eq("id", id).single();
  if (!request) return { error: "Leave request not found.", success: null };
  if (request.status !== "pending") return { error: "Only a pending request can be rejected.", success: null };

  const { error } = await admin
    .from("leave_requests")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message, success: null };

  revalidateAll();
  return { error: null, success: "Request rejected." };
}

export async function cancelLeaveRequest(id: string): Promise<LeaveActionResult> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized.", success: null };

  const admin = createAdminClient();

  const { data: request } = await admin.from("leave_requests").select("status, session_id").eq("id", id).single();
  if (!request) return { error: "Leave request not found.", success: null };
  if (request.status !== "approved") return { error: "Only an approved request can be cancelled.", success: null };

  // A session that's since gone archived is read-only everywhere, including
  // undoing an old approval's absences/substitutions.
  try {
    await assertSessionIsActive(admin, request.session_id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "This request's session is no longer active.", success: null };
  }

  // Cascades to substitutions per the existing FK (substitutions.absence_id
  // references teacher_absences on delete cascade).
  const { error: deleteError } = await admin.from("teacher_absences").delete().eq("leave_request_id", id);
  if (deleteError) return { error: deleteError.message, success: null };

  const { error: updateError } = await admin
    .from("leave_requests")
    .update({ status: "cancelled", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) return { error: updateError.message, success: null };

  revalidateAll();
  return { error: null, success: "Approved leave cancelled — its absences and substitutions were removed." };
}
