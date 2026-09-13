"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession } from "@/lib/session-context";

export interface SubmitLeaveRequestState {
  error: string | null;
  success: string | null;
}

export async function submitLeaveRequest(
  _prevState: SubmitLeaveRequestState,
  formData: FormData
): Promise<SubmitLeaveRequestState> {
  const current = await getCurrentUser();
  if (!current) return { error: "Not authorized.", success: null };

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "") || startDate;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!startDate) return { error: "Pick a start date.", success: null };
  if (endDate < startDate) return { error: "End date can't be before the start date.", success: null };

  const supabase = await createClient();
  // A leave request is always filed against whatever's currently live —
  // never a draft (not yet real) or an archived session (already over).
  const activeSession = await getActiveSession(supabase);
  const { error } = await supabase.from("leave_requests").insert({
    teacher_id: current.user.id,
    start_date: startDate,
    end_date: endDate,
    status: "pending",
    reason,
    session_id: activeSession.id,
  });
  if (error) return { error: error.message, success: null };

  revalidatePath("/dashboard/leave");
  return { error: null, success: `Leave request submitted for ${startDate}${endDate !== startDate ? ` to ${endDate}` : ""}.` };
}
