import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { DAY_ABBR } from "@/lib/timetable-grid";

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

export async function renderSectionTimetableExcel(
  supabase: SupabaseClient<Database>,
  sectionId: string
): Promise<{ buffer: Buffer; filename: string } | null> {
  const { data: section, error: sectionError } = await supabase
    .from("sections")
    .select("name, classes(name, stream), teachers(name)")
    .eq("id", sectionId)
    .single();
  if (sectionError || !section) return null;

  const cls = section.classes as unknown as { name: string; stream: string | null } | null;
  const classTeacher = section.teachers as unknown as { name: string } | null;

  const { data: entries, error: entriesError } = await supabase
    .from("timetable_entries")
    .select("day_of_week, is_practical, subjects(name), period_slots(period_number)")
    .eq("section_id", sectionId);
  if (entriesError) throw entriesError;

  const cellByDayPeriod = new Map<string, string>();
  const daysWithData = new Set<number>();
  for (const e of entries ?? []) {
    const subject = e.subjects as unknown as { name: string } | null;
    const periodNumber = (e.period_slots as unknown as { period_number: number }).period_number;
    if (!subject) continue;
    daysWithData.add(e.day_of_week);
    cellByDayPeriod.set(`${e.day_of_week}|${periodNumber}`, `${subject.name}${e.is_practical ? " - P" : ""}`);
  }

  // Monday-Friday always shown; Saturday only if this section actually has
  // any Saturday periods (most do, the XI/XII stream sections don't).
  const days = [1, 2, 3, 4, 5, ...(daysWithData.has(6) ? [6] : [])];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Timetable");
  sheet.columns = [{ width: 8 }, ...PERIOD_NUMBERS.map(() => ({ width: 14 }))];

  const titleRow = sheet.addRow([`CLASS : ${classLabel(cls)} ${section.name}`]);
  titleRow.font = { bold: true, size: 13 };
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 7);
  const teacherCell = titleRow.getCell(8);
  teacherCell.value = classTeacher?.name ?? "";
  teacherCell.font = { bold: true };
  sheet.mergeCells(titleRow.number, 8, titleRow.number, 10);

  const headerRow = sheet.addRow(["DAY", ...PERIOD_NUMBERS]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
    cell.border = THIN_BORDER;
  });

  for (const day of days) {
    const hasAny = PERIOD_NUMBERS.some((p) => cellByDayPeriod.has(`${day}|${p}`));
    if (!hasAny) {
      const row = sheet.addRow([DAY_ABBR[day].toUpperCase(), "No Class"]);
      sheet.mergeCells(row.number, 2, row.number, 10);
      row.eachCell((cell) => (cell.border = THIN_BORDER));
      row.getCell(2).alignment = { horizontal: "center" };
      continue;
    }
    const row = sheet.addRow([
      DAY_ABBR[day].toUpperCase(),
      ...PERIOD_NUMBERS.map((p) => cellByDayPeriod.get(`${day}|${p}`) ?? ""),
    ]);
    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: "center", wrapText: true };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const sectionLabel = `${classLabel(cls)}-${section.name}`.replace(/[^A-Za-z0-9()-]+/g, "_");
  return { buffer: Buffer.from(buffer), filename: `timetable-${sectionLabel}.xlsx` };
}
