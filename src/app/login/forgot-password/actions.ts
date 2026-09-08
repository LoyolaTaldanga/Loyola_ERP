"use server";

import { createClient } from "@/lib/supabase/server";

export interface ForgotPasswordState {
  message: string | null;
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (email) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/confirm`,
    });
  }

  // Same message whether or not the email exists — avoids leaking which
  // addresses are registered.
  return {
    message: "If that email is registered and verified, a password reset link has been sent to it.",
  };
}
