"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/supabase/types";

export interface LoginState {
  error: string | null;
}

const GENERIC_ERROR = "Invalid User ID or password.";

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const userId = String(formData.get("userId") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!userId || !password) {
    return { error: "Please enter both User ID and password." };
  }

  // Admins (and any teacher who already knows their verified real email) sign
  // in with an email directly. Teachers otherwise sign in with their
  // username, which we resolve to their current Supabase Auth email here —
  // that email may be the synthetic one or, once verified, their real one.
  let email = userId;
  if (!userId.includes("@")) {
    const admin = createAdminClient();
    const { data: teacher } = await admin
      .from("teachers")
      .select("email")
      .eq("username", userId.toLowerCase())
      .maybeSingle();
    if (!teacher) {
      return { error: GENERIC_ERROR };
    }
    email = teacher.email;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: GENERIC_ERROR };
  }

  const role: Role = (data.user.app_metadata?.role as Role | undefined) ?? "teacher";
  redirect(role === "admin" ? "/admin" : "/dashboard");
}
