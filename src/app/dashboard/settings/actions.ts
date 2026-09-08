"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface UpdateEmailState {
  error: string | null;
  message: string | null;
}

export async function requestEmailVerification(
  _prevState: UpdateEmailState,
  formData: FormData
): Promise<UpdateEmailState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address.", message: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in.", message: null };
  }

  const admin = createAdminClient();
  const { count: takenCount } = await admin
    .from("teachers")
    .select("id", { count: "exact", head: true })
    .eq("real_email", email);
  if ((takenCount ?? 0) > 0) {
    return { error: "That email is already registered to another account.", message: null };
  }

  // Record the pending email immediately so the UI can show "pending
  // verification" even before the link is clicked; real_email_verified only
  // flips true once /auth/confirm processes the email_change link.
  await admin.from("teachers").update({ real_email: email, real_email_verified: false }).eq("id", user.id);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${siteUrl}/auth/confirm` }
  );

  if (error) {
    return { error: error.message, message: null };
  }

  return { error: null, message: `Verification link sent to ${email}. Click it to confirm.` };
}
