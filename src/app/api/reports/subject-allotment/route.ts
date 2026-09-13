import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSubjectAllotment, renderSubjectAllotmentExcel } from "@/lib/exports/subject-allotment";
import { fileResponse } from "@/lib/exports/http";
import { getActiveSession, getSessionById } from "@/lib/session-context";

export async function GET(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const subjectId = request.nextUrl.searchParams.get("subject");
  const classId = request.nextUrl.searchParams.get("classId") ?? undefined;
  const requestedSessionId = request.nextUrl.searchParams.get("session");
  if (!subjectId) return NextResponse.json({ error: "subject is required." }, { status: 400 });

  const admin = createAdminClient();
  const session = requestedSessionId ? await getSessionById(admin, requestedSessionId) : await getActiveSession(admin);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const { data: subject } = await admin.from("subjects").select("name").eq("id", subjectId).single();
  if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });

  const rows = await loadSubjectAllotment(admin, subjectId, session.id, classId);
  const buffer = await renderSubjectAllotmentExcel(rows, subject.name);
  const slug = subject.name.replace(/[^A-Za-z0-9]+/g, "_");
  return fileResponse(buffer, `subject-allotment-${slug}.xlsx`, "xlsx");
}
