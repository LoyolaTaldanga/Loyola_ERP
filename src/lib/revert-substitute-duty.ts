import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

type Client = SupabaseClient<Database>;

/**
 * A teacher who is already someone else's assigned substitute today might
 * then get marked absent themselves (for the whole day, or for the exact
 * period they were covering). That existing assignment is no longer valid —
 * this resets it to pending (substitute cleared) so the auto-engine can
 * immediately try to find a replacement, rather than leaving an absent
 * teacher listed as a substitute.
 *
 * `affectedPeriodNumbers` is null for a full-day absence (every duty that
 * day is reverted); for a partial absence, only duties at those specific
 * period numbers are reverted.
 */
export async function revertExistingSubstituteDuty(
  client: Client,
  teacherId: string,
  date: string,
  affectedPeriodNumbers: number[] | null,
  sessionId: string
): Promise<string[]> {
  const { data: existingAsSubstitute } = await client
    .from("substitutions")
    .select("id, timetable_entries(period_slots(period_number))")
    .eq("substitute_teacher_id", teacherId)
    .eq("date", date)
    .eq("session_id", sessionId)
    .in("status", ["assigned", "confirmed", "flagged_for_review"]);

  const toRevertIds = (existingAsSubstitute ?? [])
    .filter((s) => {
      if (affectedPeriodNumbers === null) return true;
      const pn = (s.timetable_entries as unknown as { period_slots: { period_number: number } | null })?.period_slots
        ?.period_number;
      return pn !== undefined && pn !== null && affectedPeriodNumbers.includes(pn);
    })
    .map((s) => s.id);

  if (toRevertIds.length > 0) {
    await client
      .from("substitutions")
      .update({
        substitute_teacher_id: null,
        status: "pending",
        is_exception_fallback: false,
        note: null,
        notified_at: null,
      })
      .in("id", toRevertIds);
  }

  return toRevertIds;
}
