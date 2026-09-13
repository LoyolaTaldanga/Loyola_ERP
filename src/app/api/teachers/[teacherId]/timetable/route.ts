import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTeacherTimetableExcel } from "@/lib/exports/teacher-timetable";
import { fileResponse } from "@/lib/exports/http";
import { getActiveSession, getSessionById } from "@/lib/session-context";

export async function GET(request: NextRequest, { params }: { params: Promise<{ teacherId: string }> }) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { teacherId } = await params;
  if (current.role !== "admin" && current.user.id !== teacherId) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const admin = createAdminClient();
  // A teacher downloading their own timetable always gets the active
  // session; an admin browsing a draft/archived session's teacher page can
  // pass ?session= to download that session's version instead.
  const requestedSessionId = current.role === "admin" ? request.nextUrl.searchParams.get("session") : null;
  const session = requestedSessionId ? await getSessionById(admin, requestedSessionId) : await getActiveSession(admin);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const result = await renderTeacherTimetableExcel(admin, teacherId, session.id);
  if (!result) return NextResponse.json({ error: "Teacher not found." }, { status: 404 });

  return fileResponse(result.buffer, result.filename, "xlsx");
}
