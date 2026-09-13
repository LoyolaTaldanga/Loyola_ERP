import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMultiDaySlipData, renderMultiDaySlipExcel, renderMultiDaySlipPdf } from "@/lib/exports/substitution-slip";
import { parseFormat, fileResponse } from "@/lib/exports/http";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const format = parseFormat(request.nextUrl.searchParams.get("format"));
  if (!format) return NextResponse.json({ error: "format must be xlsx or pdf." }, { status: 400 });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: leaveRequest } = await admin
    .from("leave_requests")
    .select("id, teacher_id, status, start_date, end_date")
    .eq("id", id)
    .single();
  if (!leaveRequest) return NextResponse.json({ error: "Leave request not found." }, { status: 404 });

  if (current.role !== "admin" && current.user.id !== leaveRequest.teacher_id) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  if (leaveRequest.status !== "approved") {
    return NextResponse.json({ error: "This leave request hasn't been approved yet." }, { status: 400 });
  }

  const dataList = await loadMultiDaySlipData(admin, id);
  if (dataList.length === 0) return NextResponse.json({ error: "No absences found for this leave request." }, { status: 404 });

  const buffer = format === "xlsx" ? await renderMultiDaySlipExcel(dataList) : await renderMultiDaySlipPdf(dataList);
  const filename = `leave-slip-${leaveRequest.start_date}-to-${leaveRequest.end_date}.${format}`;
  return fileResponse(buffer, filename, format);
}
