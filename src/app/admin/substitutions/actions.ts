"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySubstituteIfVerified } from "@/lib/notify-substitute";

export interface AssignSubstituteResult {
  error: string | null;
  emailWarning: string | null;
}

export async function assignSubstitute(
  substitutionId: string,
  substituteTeacherId: string
): Promise<AssignSubstituteResult> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized.", emailWarning: null };
  if (!substituteTeacherId) return { error: "Pick a substitute teacher.", emailWarning: null };

  const admin = createAdminClient();

  // A manual pick always wins over whatever the auto-engine suggested —
  // clears is_exception_fallback since a deliberate Admin choice is no
  // longer "an exception the engine couldn't confidently resolve".
  const { error: updateError } = await admin
    .from("substitutions")
    .update({
      substitute_teacher_id: substituteTeacherId,
      assignment_method: "manual",
      status: "assigned",
      is_exception_fallback: false,
      note: null,
    })
    .eq("id", substitutionId);
  if (updateError) return { error: updateError.message, emailWarning: null };

  const { error: emailWarning } = await notifySubstituteIfVerified(admin, substitutionId, substituteTeacherId);

  revalidatePath("/admin");
  revalidatePath("/admin/substitutions");
  revalidatePath("/dashboard");
  return { error: null, emailWarning };
}
