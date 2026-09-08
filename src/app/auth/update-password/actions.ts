"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/supabase/types";

export interface UpdatePasswordState {
  error: string | null;
}

export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=session-expired");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Could not update password. Please try the invite link again." };
  }

  const role: Role = (user.app_metadata?.role as Role | undefined) ?? "teacher";
  redirect(role === "admin" ? "/admin" : "/dashboard");
}
