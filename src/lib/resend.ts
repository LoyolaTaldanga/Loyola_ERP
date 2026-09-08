import { Resend } from "resend";

export interface SubstitutionEmailInput {
  to: string;
  substituteName: string;
  absentTeacherName: string;
  date: string;
  periodLabel: string;
  sectionLabel: string;
  subjectName: string | null;
}

/**
 * Best-effort notification — email is a nice-to-have on top of the
 * /dashboard "Substitution Duty Today" box, which is the assignment's real
 * source of truth. Missing RESEND_API_KEY or a send failure should never
 * block the assignment itself, so this only ever returns an error string
 * for the caller to log/display, never throws.
 */
export async function sendSubstitutionEmail(input: SubstitutionEmailInput): Promise<{ error: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping substitution email notification.");
    return { error: "Email not configured (RESEND_API_KEY missing) — notification skipped." };
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: `Substitution duty: ${input.date}, ${input.periodLabel}`,
      html: `
        <p>Dear ${input.substituteName},</p>
        <p>You have been assigned a substitution duty:</p>
        <ul>
          <li><strong>Date:</strong> ${input.date}</li>
          <li><strong>Period:</strong> ${input.periodLabel}</li>
          <li><strong>Class:</strong> ${input.sectionLabel}</li>
          <li><strong>Subject:</strong> ${input.subjectName ?? "—"}</li>
          <li><strong>Covering for:</strong> ${input.absentTeacherName}</li>
        </ul>
        <p>This also appears on your dashboard under "Substitution Duty Today".</p>
        <p>— Loyola School, Taldanga</p>
      `,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to send substitution email." };
  }
}
