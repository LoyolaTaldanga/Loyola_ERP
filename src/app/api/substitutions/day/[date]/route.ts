import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSlipData, renderSlipExcel, renderSlipPdf } from "@/lib/exports/substitution-slip";
import { parseFormat, fileResponse } from "@/lib/exports/http";

export async function GET(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const format = parseFormat(request.nextUrl.searchParams.get("format"));
  if (!format) return NextResponse.json({ error: "format must be xlsx or pdf." }, { status: 400 });

  const { date } = await params;
  const admin = createAdminClient();

  const { data: absences, error } = await admin.from("teacher_absences").select("id").eq("date", date);
  if (error) throw error;
  const absenceIds = (absences ?? []).map((a) => a.id);

  const data = await loadSlipData(admin, absenceIds);
  if (!data) return NextResponse.json({ error: "No absences found for that date." }, { status: 404 });

  const buffer = format === "xlsx" ? await renderSlipExcel(data) : await renderSlipPdf(data);
  const filename = `substitution-slip-${date}-all.${format}`;
  return fileResponse(buffer, filename, format);
}
