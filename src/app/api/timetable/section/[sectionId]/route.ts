import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderSectionTimetableExcel } from "@/lib/exports/section-timetable";
import { fileResponse } from "@/lib/exports/http";

export async function GET(_request: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { sectionId } = await params;
  const result = await renderSectionTimetableExcel(createAdminClient(), sectionId);
  if (!result) return NextResponse.json({ error: "Section not found." }, { status: 404 });

  return fileResponse(result.buffer, result.filename, "xlsx");
}
