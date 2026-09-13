"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TeacherGroup } from "@/lib/supabase/types";
import { generateUniqueUsername, syntheticEmailFor } from "@/lib/username";
import { generateTempPassword } from "@/lib/password";

export interface CreateTeacherState {
  error: string | null;
  credentials: { username: string; password: string } | null;
}

export async function createTeacher(
  _prevState: CreateTeacherState,
  formData: FormData
): Promise<CreateTeacherState> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return { error: "Not authorized.", credentials: null };
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const group = String(formData.get("group") ?? "") as TeacherGroup;

  if (!name || (group !== "A" && group !== "B")) {
    return { error: "Name and group are required.", credentials: null };
  }

  const admin = createAdminClient();

  const username = await generateUniqueUsername(name, async (candidate) => {
    const { count } = await admin
      .from("teachers")
      .select("id", { count: "exact", head: true })
      .eq("username", candidate);
    return (count ?? 0) > 0;
  });
  const email = syntheticEmailFor(username);
  const password = generateTempPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "teacher" },
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create the auth account.", credentials: null };
  }

  const { error: insertError } = await admin.from("teachers").insert({
    id: created.user.id,
    name,
    email,
    username,
    phone,
    group,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: insertError.message, credentials: null };
  }

  revalidatePath("/admin/teachers");
  return { error: null, credentials: { username, password } };
}

export interface ResetPasswordState {
  error: string | null;
  password: string | null;
  teacherName: string | null;
}

export async function resetTeacherPassword(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return { error: "Not authorized.", password: null, teacherName: null };
  }

  const teacherId = String(formData.get("teacherId") ?? "");
  const teacherName = String(formData.get("teacherName") ?? "");
  if (!teacherId) {
    return { error: "Missing teacher.", password: null, teacherName: null };
  }

  const admin = createAdminClient();
  const password = generateTempPassword();

  const { error } = await admin.auth.admin.updateUserById(teacherId, { password });
  if (error) {
    return { error: error.message, password: null, teacherName: null };
  }

  return { error: null, password, teacherName };
}

export async function updateTeacherGroup(
  teacherId: string,
  group: TeacherGroup
): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return { error: "Not authorized." };
  }
  if (group !== "A" && group !== "B") {
    return { error: "Invalid group." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("teachers")
    .update({ group, group_needs_review: false })
    .eq("id", teacherId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/teachers");
  return { error: null };
}

export async function updateLeaveQuotaOverride(
  teacherId: string,
  value: number | null
): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return { error: "Not authorized." };
  }
  if (value !== null && (!Number.isInteger(value) || value < 0)) {
    return { error: "Quota must be blank or a non-negative whole number." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("teachers").update({ leave_quota_override: value }).eq("id", teacherId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/teachers");
  revalidatePath("/admin/teachers/[id]", "page");
  revalidatePath("/admin/leave-summary");
  revalidatePath("/dashboard");
  return { error: null };
}
