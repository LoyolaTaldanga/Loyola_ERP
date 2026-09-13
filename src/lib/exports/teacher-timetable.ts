import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { DAYS, DAY_ABBR } from "@/lib/timetable-grid";

const PERIOD_NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

function classLabel(cls: { name: string; stream: string | null } | null): string {
  if (!cls) return "";
  return `${cls.name}${cls.stream ? ` (${cls.stream})` : ""}`;
}

export async function renderTeacherTimetableExcel(
  supabase: SupabaseClient<Database>,
  teacherId: string,
  sessionId: string
): Promise<{ buffer: Buffer; filename: string } | null> {
  const { data: teacher, error: teacherError } = await supabase
    .from("teachers")
    .select("name")
    .eq("id", teacherId)
    .single();
  if (teacherError || !teacher) return null;

  const { data: entries, error: entriesError } = await supabase
    .from("timetable_entries")
    .select("day_of_week, is_practical, subjects(name), period_slots(period_number), sections(name, classes(name, stream))")
    .eq("teacher_id", teacherId)
    .eq("session_id", sessionId);
  if (entriesError) throw entriesError;

  interface Cell {
    subjectName: string;
    sectionLabel: string;
  }
  const cellByDayPeriod = new Map<string, Cell>();
  for (const e of entries ?? []) {
    const subject = e.subjects as unknown as { name: string } | null;
    const section = e.sections as unknown as { name: string; classes: { name: string; stream: string | null } | null } | null;
    const periodNumber = (e.period_slots as unknown as { period_number: number }).period_number;
    if (!subject) continue;
    cellByDayPeriod.set(`${e.day_of_week}|${periodNumber}`, {
      subjectName: `${subject.name}${e.is_practical ? " - P" : ""}`,
      sectionLabel: section ? `${classLabel(section.classes)} ${section.name}` : "",
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Timetable");
  sheet.columns = [{ width: 8 }, ...PERIOD_NUMBERS.map(() => ({ width: 14 }))];

  const titleRow = sheet.addRow([`TEACHER: ${teacher.name}`]);
  titleRow.font = { bold: true, size: 13 };
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 10);

  const headerRow = sheet.addRow(["DAY", ...PERIOD_NUMBERS]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
    cell.border = THIN_BORDER;
  });

  // Every day Mon-Sat is always shown for a teacher (unlike the section
  // export, which omits Saturday entirely for sections that never have
  // one) — a day with zero periods for this teacher (a personal holiday,
  // e.g. many teachers' Saturdays) renders as "No Class" rather than being
  // dropped, so the export always reads as a complete week.
  for (const day of DAYS) {
    const hasAny = PERIOD_NUMBERS.some((p) => cellByDayPeriod.has(`${day.value}|${p}`));
    if (!hasAny) {
      const row = sheet.addRow([DAY_ABBR[day.value].toUpperCase(), "No Class"]);
      sheet.mergeCells(row.number, 2, row.number, 10);
      row.eachCell((cell) => (cell.border = THIN_BORDER));
      row.getCell(2).alignment = { horizontal: "center" };
      continue;
    }
    const subjectRow = sheet.addRow([
      DAY_ABBR[day.value].toUpperCase(),
      ...PERIOD_NUMBERS.map((p) => cellByDayPeriod.get(`${day.value}|${p}`)?.subjectName ?? ""),
    ]);
    const sectionRow = sheet.addRow([
      "",
      ...PERIOD_NUMBERS.map((p) => cellByDayPeriod.get(`${day.value}|${p}`)?.sectionLabel ?? ""),
    ]);
    sheet.mergeCells(subjectRow.number, 1, sectionRow.number, 1);
    for (const row of [subjectRow, sectionRow]) {
      row.eachCell((cell) => {
        cell.border = THIN_BORDER;
        cell.alignment = { horizontal: "center", wrapText: true };
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const nameSlug = teacher.name.replace(/[^A-Za-z0-9]+/g, "_");
  return { buffer: Buffer.from(buffer), filename: `timetable-${nameSlug}.xlsx` };
}
