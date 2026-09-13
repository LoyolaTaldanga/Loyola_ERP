"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateDefaultLeaveQuota(value: number): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized." };
  if (!Number.isInteger(value) || value < 0) return { error: "Quota must be a non-negative whole number." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", "default_annual_leave_quota");
  if (error) return { error: error.message };

  revalidatePath("/admin/leave-summary");
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/teachers/[id]", "page");
  revalidatePath("/dashboard");
  return { error: null };
}
