"use server";

// Shared by /admin/timetable (single-section grid) and /admin/teachers/[id]
// (a teacher's own cross-section grid) — both edit the exact same
// timetable_entries rows, so they call this one save function rather than
// forking the logic.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSessionEditable } from "@/lib/session-context";

export interface SaveCellInput {
  sectionId: string;
  dayOfWeek: number;
  periodSlotId: string;
  subjectId: string | null;
  teacherId: string | null;
  isPractical: boolean;
}

export async function saveTimetableCell(input: SaveCellInput): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: section } = await admin.from("sections").select("session_id").eq("id", input.sectionId).single();
  if (!section) return { error: "Section not found." };
  try {
    await assertSessionEditable(admin, section.session_id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Session is not editable." };
  }

  const { error } = await admin.from("timetable_entries").upsert(
    {
      section_id: input.sectionId,
      day_of_week: input.dayOfWeek,
      period_slot_id: input.periodSlotId,
      subject_id: input.subjectId,
      teacher_id: input.teacherId,
      is_practical: input.isPractical,
    },
    { onConflict: "section_id,day_of_week,period_slot_id" }
  );

  if (error) return { error: error.message };
  revalidatePath("/admin/timetable");
  revalidatePath("/admin/teachers/[id]", "page");
  revalidatePath("/dashboard");
  return { error: null };
}
