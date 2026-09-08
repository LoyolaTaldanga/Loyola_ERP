"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";

export async function assignClassTeacher(sectionId: string, teacherId: string): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized." };
  if (!sectionId) return { error: "Pick a section first." };

  const admin = createAdminClient();
  const { error } = await admin.from("sections").update({ class_teacher_id: teacherId }).eq("id", sectionId);
  if (error) return { error: error.message };

  revalidatePath("/admin/teachers/[id]", "page");
  revalidatePath("/admin/timetable");
  return { error: null };
}

export async function unassignClassTeacher(sectionId: string): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized." };

  const admin = createAdminClient();
  const { error } = await admin.from("sections").update({ class_teacher_id: null }).eq("id", sectionId);
  if (error) return { error: error.message };

  revalidatePath("/admin/teachers/[id]", "page");
  revalidatePath("/admin/timetable");
  return { error: null };
}
