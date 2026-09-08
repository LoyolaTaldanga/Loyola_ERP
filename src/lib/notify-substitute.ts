import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { sendSubstitutionEmail } from "./resend";

type Client = SupabaseClient<Database>;

/**
 * Shared by both the manual assignment action and the Phase 3 auto-engine —
 * one notification path, not two, so a fix in one always applies to both.
 * Best-effort: only sends when the substitute has a verified real_email;
 * any failure (including no email configured) is returned as a warning
 * string, never thrown, since it must never block the assignment itself.
 */
export async function notifySubstituteIfVerified(
  client: Client,
  substitutionId: string,
  substituteTeacherId: string
): Promise<{ error: string | null }> {
  const { data: substitute } = await client
    .from("teachers")
    .select("name, real_email, real_email_verified")
    .eq("id", substituteTeacherId)
    .single();
  if (!substitute?.real_email_verified || !substitute.real_email) return { error: null };

  const { data: sub } = await client
    .from("substitutions")
    .select(
      `date,
       timetable_entries(subject_id, sections(name, classes(name, stream)), subjects(name), period_slots(label, start_time, end_time)),
       teacher_absences(teacher_id, teachers!teacher_absences_teacher_id_fkey(name))`
    )
    .eq("id", substitutionId)
    .single();
  if (!sub) return { error: "Substitution not found." };

  const entry = sub.timetable_entries as unknown as {
    subjects: { name: string } | null;
    sections: { name: string; classes: { name: string; stream: string | null } | null } | null;
    period_slots: { label: string; start_time: string; end_time: string };
  };
  const absence = sub.teacher_absences as unknown as { teachers: { name: string } | null } | null;
  const cls = entry.sections?.classes ?? null;
  const sectionLabel = entry.sections
    ? `${cls?.name ?? ""}${cls?.stream ? ` (${cls.stream})` : ""} — ${entry.sections.name}`
    : "";

  const { error } = await sendSubstitutionEmail({
    to: substitute.real_email,
    substituteName: substitute.name,
    absentTeacherName: absence?.teachers?.name ?? "a teacher",
    date: sub.date,
    periodLabel: `${entry.period_slots.label} (${entry.period_slots.start_time.slice(0, 5)}–${entry.period_slots.end_time.slice(0, 5)})`,
    sectionLabel,
    subjectName: entry.subjects?.name ?? null,
  });
  if (error) return { error };

  await client.from("substitutions").update({ notified_at: new Date().toISOString() }).eq("id", substitutionId);
  return { error: null };
}
