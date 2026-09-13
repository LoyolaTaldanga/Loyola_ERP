import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Session, SessionStatus } from "./supabase/types";

type Client = SupabaseClient<Database>;

export const VIEWING_SESSION_COOKIE = "admin_viewing_session";

/** Structural rows (classes/sections/timetable_entries) are editable while a session is being prepared or is live. */
export function isSessionEditable(status: SessionStatus): boolean {
  return status === "draft" || status === "active";
}

export async function getActiveSession(client: Client): Promise<Session> {
  const { data, error } = await client.from("sessions").select("*").eq("status", "active").single();
  if (error || !data) throw new Error("No active session found — this should never happen.");
  return data;
}

export async function getSessionById(client: Client, sessionId: string): Promise<Session | null> {
  const { data } = await client.from("sessions").select("*").eq("id", sessionId).single();
  return data;
}

/**
 * Admin pages only — resolves whichever session the session-switcher cookie
 * currently points at, falling back to the active session if the cookie is
 * missing or points at a session that no longer exists. Reads next/headers'
 * cookies(), so this can only be called from a Server Component or Server
 * Action, never from a plain lib module or standalone script (those receive
 * a sessionId as an explicit parameter instead).
 */
export async function getViewingSession(client: Client): Promise<Session> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const viewingId = cookieStore.get(VIEWING_SESSION_COOKIE)?.value;
  if (viewingId) {
    const session = await getSessionById(client, viewingId);
    if (session) return session;
  }
  return getActiveSession(client);
}

/**
 * Structural writes (timetable cells, teacher-linking, class-teacher
 * assignment, new sections): draft or active only. Always derive sessionId
 * server-side from the row actually being touched — never trust a
 * client-supplied value — so a stale draft banner can't be used to sneak a
 * write into an archived session.
 */
export async function assertSessionEditable(client: Client, sessionId: string): Promise<Session> {
  const session = await getSessionById(client, sessionId);
  if (!session) throw new Error("Session not found.");
  if (!isSessionEditable(session.status)) {
    throw new Error(`"${session.label}" is archived and read-only — it can't be edited.`);
  }
  return session;
}

/**
 * Operational writes (absences/substitutions/leave_requests): must still be
 * exactly active. Catches a request that sat pending across an Activate
 * cutover (e.g. a leave request approved after a newer session took over).
 */
export async function assertSessionIsActive(client: Client, sessionId: string): Promise<Session> {
  const session = await getSessionById(client, sessionId);
  if (!session) throw new Error("Session not found.");
  if (session.status !== "active") {
    throw new Error(`"${session.label}" is no longer the active session — this action is no longer available.`);
  }
  return session;
}
