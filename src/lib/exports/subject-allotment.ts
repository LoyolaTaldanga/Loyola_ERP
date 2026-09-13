import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface AllotmentRow {
  className: string;
  stream: string | null;
  sectionName: string;
  teacherName: string;
}

export async function loadSubjectAllotment(
  supabase: SupabaseClient<Database>,
  subjectId: string,
  sessionId: string,
  classId?: string
): Promise<AllotmentRow[]> {
  let query = supabase
    .from("timetable_entries")
    .select("teachers(name), sections!inner(name, class_id, classes(name, stream))")
    .eq("subject_id", subjectId)
    .eq("session_id", sessionId)
    .not("teacher_id", "is", null);
  if (classId) query = query.eq("sections.class_id", classId);

  const { data, error } = await query;
  if (error) throw error;

  const seen = new Map<string, AllotmentRow>();
  for (const row of data ?? []) {
    const section = row.sections as unknown as {
      name: string;
      classes: { name: string; stream: string | null } | null;
    } | null;
    const teacher = row.teachers as unknown as { name: string } | null;
    if (!section?.classes || !teacher) continue;
    const key = `${section.classes.name}|${section.classes.stream ?? ""}|${section.name}|${teacher.name}`;
    if (!seen.has(key)) {
      seen.set(key, {
        className: section.classes.name,
        stream: section.classes.stream,
        sectionName: section.name,
        teacherName: teacher.name,
      });
    }
  }

  return [...seen.values()].sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      (a.stream ?? "").localeCompare(b.stream ?? "") ||
      a.sectionName.localeCompare(b.sectionName) ||
      a.teacherName.localeCompare(b.teacherName)
  );
}

export async function renderSubjectAllotmentExcel(rows: AllotmentRow[], subjectName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Subject Allotment");
  sheet.columns = [
    { header: "Class", key: "className", width: 12 },
    { header: "Stream", key: "stream", width: 14 },
    { header: "Section", key: "sectionName", width: 12 },
    { header: "Teacher", key: "teacherName", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.insertRow(1, [`Subject: ${subjectName}`]);
  sheet.mergeCells(1, 1, 1, 4);
  sheet.getRow(1).font = { bold: true, size: 13 };

  for (const row of rows) {
    sheet.addRow({ className: row.className, stream: row.stream ?? "", sectionName: row.sectionName, teacherName: row.teacherName });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
