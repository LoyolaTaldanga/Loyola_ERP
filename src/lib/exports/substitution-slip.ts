import "server-only";
import * as path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const TEMPLATE_FILE = path.join(process.cwd(), "docs/reference/Loyola_School_Taldanga_Substitution_Copy.xlsx");
const DAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

// The template has exactly 21 blank data rows (rows 8-28 in the .xlsx, 1-indexed);
// a slip with more periods needing cover than that duplicates the last row's
// formatting downward via ExcelJS's duplicateRow rather than overflowing it.
const TEMPLATE_FIRST_DATA_ROW = 8;
const TEMPLATE_LAST_DATA_ROW = 28;

export interface SlipRow {
  periodNumber: number;
  className: string;
  sectionName: string;
  subjectName: string;
  substituteTeacherName: string;
}

export interface SlipData {
  date: string; // YYYY-MM-DD
  dayName: string;
  absenteeNames: string[];
  rows: SlipRow[];
}

function classLabel(cls: { name: string; stream: string | null } | null): string {
  if (!cls) return "";
  return `${cls.name}${cls.stream ? ` (${cls.stream})` : ""}`;
}

function formatDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Every substitution generated from a set of absences, grouped into one
 * slip's worth of rows. Passing a single absence's id produces the normal
 * per-teacher daily slip; passing every absence for one date produces the
 * "download all for today" combined slip.
 */
export async function loadSlipData(
  supabase: SupabaseClient<Database>,
  absenceIds: string[]
): Promise<SlipData | null> {
  if (absenceIds.length === 0) return null;

  const { data: absences, error: absencesError } = await supabase
    .from("teacher_absences")
    .select("id, date, teachers!teacher_absences_teacher_id_fkey(name)")
    .in("id", absenceIds);
  if (absencesError) throw absencesError;
  if (!absences || absences.length === 0) return null;

  const date = absences[0].date;
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  const absenteeNames = [
    ...new Set(
      absences.map((a) => (a.teachers as unknown as { name: string } | null)?.name ?? "Unknown").sort()
    ),
  ];

  const { data: subs, error: subsError } = await supabase
    .from("substitutions")
    .select(
      `absence_id,
       timetable_entries(subjects(name), sections(name, classes(name, stream)), period_slots(period_number)),
       substitute:teachers!substitutions_substitute_teacher_id_fkey(name)`
    )
    .in("absence_id", absenceIds);
  if (subsError) throw subsError;

  const rows: SlipRow[] = (subs ?? [])
    .map((s) => {
      const entry = s.timetable_entries as unknown as {
        subjects: { name: string } | null;
        sections: { name: string; classes: { name: string; stream: string | null } | null } | null;
        period_slots: { period_number: number };
      };
      const substitute = s.substitute as unknown as { name: string } | null;
      return {
        periodNumber: entry.period_slots.period_number,
        className: classLabel(entry.sections?.classes ?? null),
        sectionName: entry.sections?.name ?? "",
        subjectName: entry.subjects?.name ?? "",
        substituteTeacherName: substitute?.name ?? "",
      };
    })
    .sort((a, b) => a.periodNumber - b.periodNumber || a.className.localeCompare(b.className));

  return { date, dayName: DAY_NAMES[dayOfWeek], absenteeNames, rows };
}

// Loads a fresh copy of the template and fills in one date's worth of data —
// shared by the single-day export and the multi-day one (which fills one of
// these per date, then stitches the resulting sheets together).
async function fillSlipTemplate(data: SlipData): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_FILE);
  const sheet = workbook.worksheets[0];

  sheet.getCell("A4").value = `DATE: ${formatDate(data.date)}`;
  sheet.getCell("D4").value = `DAY: ${data.dayName}`;
  sheet.getCell("A5").value = `ABSENTEES: ${data.absenteeNames.join(", ")}`;

  const capacity = TEMPLATE_LAST_DATA_ROW - TEMPLATE_FIRST_DATA_ROW + 1;
  if (data.rows.length > capacity) {
    sheet.duplicateRow(TEMPLATE_LAST_DATA_ROW, data.rows.length - capacity, true);
  }

  data.rows.forEach((row, i) => {
    const r = TEMPLATE_FIRST_DATA_ROW + i;
    sheet.getRow(r).getCell(1).value = row.periodNumber;
    sheet.getRow(r).getCell(2).value = row.className;
    sheet.getRow(r).getCell(3).value = row.sectionName;
    sheet.getRow(r).getCell(4).value = row.subjectName;
    sheet.getRow(r).getCell(5).value = row.substituteTeacherName;
    // Column 6 (Teacher's Signature) intentionally left untouched — filled by hand.
  });

  return sheet;
}

export async function renderSlipExcel(data: SlipData): Promise<Buffer> {
  const sheet = await fillSlipTemplate(data);
  const buffer = await sheet.workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// "A1:F1" -> "A6:F6" for a given row offset (columns untouched).
function shiftMergeRange(range: string, rowOffset: number): string {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  if (!match) return range;
  const [, col1, row1, col2, row2] = match;
  return `${col1}${Number(row1) + rowOffset}:${col2}${Number(row2) + rowOffset}`;
}

const BLOCK_GAP_ROWS = 2;

export async function loadMultiDaySlipData(
  supabase: SupabaseClient<Database>,
  leaveRequestId: string
): Promise<SlipData[]> {
  const { data: absences, error } = await supabase
    .from("teacher_absences")
    .select("id")
    .eq("leave_request_id", leaveRequestId)
    .order("date", { ascending: true });
  if (error) throw error;

  const results: SlipData[] = [];
  for (const a of absences ?? []) {
    const slip = await loadSlipData(supabase, [a.id]);
    if (slip) results.push(slip);
  }
  return results;
}

/**
 * One combined workbook covering every date in dataList — each date gets its
 * own full copy of the template's block (header/date/day/absentees/table/
 * footer), stacked in one sheet with a blank gap between blocks. Reuses
 * fillSlipTemplate per date so the per-day fill logic can never drift from
 * the single-day export.
 */
export async function renderMultiDaySlipExcel(dataList: SlipData[]): Promise<Buffer> {
  const combined = new ExcelJS.Workbook();
  const combinedSheet = combined.addWorksheet("Substitution Copy");

  let rowOffset = 0;
  for (const data of dataList) {
    const sourceSheet = await fillSlipTemplate(data);
    const rowCount = sourceSheet.rowCount;

    for (let r = 1; r <= rowCount; r++) {
      const srcRow = sourceSheet.getRow(r);
      const destRow = combinedSheet.getRow(rowOffset + r);
      destRow.height = srcRow.height;
      srcRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const destCell = destRow.getCell(colNumber);
        destCell.value = cell.value;
        destCell.style = cell.style;
      });
    }
    for (const merge of sourceSheet.model.merges as unknown as string[]) {
      combinedSheet.mergeCells(shiftMergeRange(merge, rowOffset));
    }

    rowOffset += rowCount + BLOCK_GAP_ROWS;
  }

  const buffer = await combined.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

const PDF_COLUMNS = [
  { key: "period", label: "PERIOD", width: 45 },
  { key: "class", label: "CLASS", width: 90 },
  { key: "section", label: "SECTION", width: 80 },
  { key: "subject", label: "SUBJECT", width: 120 },
  { key: "teacher", label: "TEACHERS ASSIGNED", width: 130 },
  { key: "signature", label: "TEACHER'S\nSIGNATURE", width: 75 },
] as const;

// Draws one date's full block (header/date/day/absentees/table/footer)
// starting at the document's current position — shared by the single-day
// export (one call) and the multi-day one (one call per date, with an
// addPage() between them).
function drawSlipPage(doc: PDFKit.PDFDocument, data: SlipData): void {
  const left = doc.page.margins.left;
  const tableWidth = PDF_COLUMNS.reduce((sum, c) => sum + c.width, 0);

  doc.font("Helvetica-Bold").fontSize(14).text("LOYOLA SCHOOL, TALDANGA", left, doc.y, {
    width: tableWidth,
    align: "center",
  });
  doc.font("Helvetica").fontSize(9).text("P. O. : CHIRKUNDA - 828 202", { width: tableWidth, align: "center" });
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(12).text("SUBSTITUTION COPY", { width: tableWidth, align: "center" });
  doc.moveDown(1);

  doc.font("Helvetica").fontSize(10);
  doc.text(`DATE: ${formatDate(data.date)}`, left, doc.y, { continued: true, width: tableWidth });
  doc.text(`        DAY: ${data.dayName}`);
  doc.moveDown(0.5);
  doc.text(`ABSENTEES: ${data.absenteeNames.join(", ")}`);
  doc.moveDown(1);

  const rowHeight = 22;
  const headerHeight = 26;
  let y = doc.y;

  function drawRow(cells: string[], top: number, height: number, bold: boolean) {
    let x = left;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 8 : 9);
    for (let i = 0; i < PDF_COLUMNS.length; i++) {
      const col = PDF_COLUMNS[i];
      doc.rect(x, top, col.width, height).stroke();
      doc.text(cells[i] ?? "", x + 3, top + height / 2 - (bold ? 10 : 5), {
        width: col.width - 6,
        align: "center",
      });
      x += col.width;
    }
  }

  drawRow(PDF_COLUMNS.map((c) => c.label), y, headerHeight, true);
  y += headerHeight;

  for (const row of data.rows) {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 60) {
      doc.addPage();
      y = doc.page.margins.top;
      drawRow(PDF_COLUMNS.map((c) => c.label), y, headerHeight, true);
      y += headerHeight;
    }
    drawRow(
      [String(row.periodNumber), row.className, row.sectionName, row.subjectName, row.substituteTeacherName, ""],
      y,
      rowHeight,
      false
    );
    y += rowHeight;
  }

  y += 30;
  doc.font("Helvetica").fontSize(10);
  doc.text("PREPARED BY: __________________________", left, y);
  doc.text("HEAD OF THE INSTITUTION", left + tableWidth / 2, y);
}

export async function renderSlipPdf(data: SlipData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  drawSlipPage(doc, data);
  doc.end();
  return done;
}

export async function renderMultiDaySlipPdf(dataList: SlipData[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  dataList.forEach((data, i) => {
    if (i > 0) doc.addPage();
    drawSlipPage(doc, data);
  });
  doc.end();
  return done;
}
