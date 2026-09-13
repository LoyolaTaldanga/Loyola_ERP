"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, getSessionById, VIEWING_SESSION_COOKIE } from "@/lib/session-context";
import { cloneSessionData } from "@/lib/session-clone";

export interface SessionActionResult {
  error: string | null;
  success: string | null;
}

function revalidateAll() {
  revalidatePath("/admin");
  revalidatePath("/admin/sessions");
  revalidatePath("/admin/absences");
  revalidatePath("/admin/substitutions");
  revalidatePath("/admin/timetable");
  revalidatePath("/admin/timetable/review");
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/leave-requests");
  revalidatePath("/admin/reports/subject-allotment");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leave");
}

export async function setViewingSession(id: string): Promise<SessionActionResult> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized.", success: null };

  const admin = createAdminClient();
  const session = await getSessionById(admin, id);
  if (!session) return { error: "Session not found.", success: null };

  const cookieStore = await cookies();
  cookieStore.set(VIEWING_SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });

  revalidateAll();
  return { error: null, success: null };
}

export async function activateSession(id: string): Promise<SessionActionResult> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized.", success: null };

  const admin = createAdminClient();
  const { error } = await admin.rpc("activate_session", { target_session_id: id });
  if (error) return { error: error.message, success: null };

  revalidateAll();
  return { error: null, success: "Session activated." };
}

export async function createNewSession(label: string): Promise<SessionActionResult> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized.", success: null };

  const trimmedLabel = label.trim();
  if (!trimmedLabel) return { error: "Label is required.", success: null };

  const admin = createAdminClient();
  const active = await getActiveSession(admin);

  const { data: newSession, error: sessionError } = await admin
    .from("sessions")
    .insert({ label: trimmedLabel, status: "draft", created_from_session_id: active.id })
    .select("id")
    .single();
  if (sessionError || !newSession) {
    return { error: sessionError?.message ?? "Could not create the session.", success: null };
  }

  const clone = await cloneSessionData(admin, active.id, newSession.id);
  if (clone.error) return { error: clone.error, success: null };

  revalidateAll();
  return {
    error: null,
    success: `Created draft session "${trimmedLabel}" — cloned ${clone.classesCloned} classes, ${clone.sectionsCloned} sections, ${clone.entriesCloned} timetable entries from "${active.label}".`,
  };
}

export async function discardSession(id: string): Promise<SessionActionResult> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized.", success: null };

  const admin = createAdminClient();
  const { error, count } = await admin.from("sessions").delete({ count: "exact" }).eq("id", id).eq("status", "draft");
  if (error) return { error: error.message, success: null };
  if (!count) return { error: "Only a draft session can be discarded.", success: null };

  revalidateAll();
  return { error: null, success: "Draft session discarded." };
}
