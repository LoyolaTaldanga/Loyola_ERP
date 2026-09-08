"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TeacherGroup } from "@/lib/supabase/types";

export interface CreateTeacherState {
  error: string | null;
  success: string | null;
}

export async function createTeacher(
  _prevState: CreateTeacherState,
  formData: FormData
): Promise<CreateTeacherState> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return { error: "Not authorized.", success: null };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const group = String(formData.get("group") ?? "") as TeacherGroup;

  if (!name || !email || (group !== "A" && group !== "B")) {
    return { error: "Name, email, and group are required.", success: null };
  }

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: "teacher" },
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create the auth account.", success: null };
  }

  const { error: insertError } = await admin.from("teachers").insert({
    id: created.user.id,
    name,
    email,
    phone,
    group,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: insertError.message, success: null };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm`,
  });

  if (inviteError) {
    return {
      error: null,
      success: `Teacher created, but the invite email could not be sent (${inviteError.message}). Ask them to use "Forgot password" on the login page.`,
    };
  }

  revalidatePath("/admin/teachers");
  return { error: null, success: `Invite sent to ${email}.` };
}
