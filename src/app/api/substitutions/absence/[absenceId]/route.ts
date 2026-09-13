import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSlipData, renderSlipExcel, renderSlipPdf } from "@/lib/exports/substitution-slip";
import { parseFormat, fileResponse } from "@/lib/exports/http";

export async function GET(request: NextRequest, { params }: { params: Promise<{ absenceId: string }> }) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const format = parseFormat(request.nextUrl.searchParams.get("format"));
  if (!format) return NextResponse.json({ error: "format must be xlsx or pdf." }, { status: 400 });

  const { absenceId } = await params;
  const admin = createAdminClient();

  if (current.role !== "admin") {
    // A substitute teacher may only download a slip they actually appear on.
    const { count } = await admin
      .from("substitutions")
      .select("id", { count: "exact", head: true })
      .eq("absence_id", absenceId)
      .eq("substitute_teacher_id", current.user.id);
    if (!count) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const data = await loadSlipData(admin, [absenceId]);
  if (!data) return NextResponse.json({ error: "Absence not found." }, { status: 404 });

  const buffer = format === "xlsx" ? await renderSlipExcel(data) : await renderSlipPdf(data);
  const filename = `substitution-slip-${data.date}-${absenceId.slice(0, 8)}.${format}`;
  return fileResponse(buffer, filename, format);
}
