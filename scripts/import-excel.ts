// Re-runnable importer for Loyola School Taldanga's 2026-27 timetable.
//
// Reads the Class-wise and Teacher-wise Excel files, seeds period_slots from
// the official bell timing, upserts classes/sections/subjects/timetable_entries
// (subject only — teacher_id is intentionally left null; see docs/reference
// discussion: neither Excel file has teacher emails, so accounts have to be
// created by hand via /admin/teachers, then linked in a follow-up pass), and
// cross-validates every class-wise cell against the teacher-wise sheet,
// reporting mismatches/ambiguities instead of silently picking one.
//
// Usage: npm run import:excel

import * as path from "node:path";
import * as fs from "node:fs";
import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import { PERIOD_SLOTS, EXCEL_PERIOD_TO_SLOT } from "./import-lib/period-slots";
import { normalizeSubject } from "./import-lib/subjects";
import { GRADE_ORDER, ClassCodeRegistry, parseClassLabel } from "./import-lib/class-codes";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const CLASS_WISE_FILE = path.join(process.cwd(), "docs/reference/Class Time Table 202627.xlsx");
const TEACHER_WISE_FILE = path.join(process.cwd(), "docs/reference/Teacher time table 2026-2027.xlsx");
const REPORT_FILE = path.join(process.cwd(), "scripts/import-report.json");

const DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

// The teacher-wise sheet often just says "PRACTICALS" (or "SCIENCE LAB")
// without naming the subject, while the class-wise sheet names the actual
// subject with a practical suffix (e.g. "PHYSICS - P"). That's an expected
// pattern, not a real disagreement, so it shouldn't be reported as a mismatch.
const GENERIC_PRACTICAL_LABELS = new Set(["PRACTICALS", "SCIENCE LAB", "LAB", "COMP.LAB"]);

function sheetRows(filePath: string, sheetName?: string): unknown[][] {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[sheetName ?? wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
}

function cellStr(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

// ---------------------------------------------------------------------------
// Class-wise sheet: classes, sections, subjects, timetable_entries (subject only)
// ---------------------------------------------------------------------------

interface ClassWiseCell {
  classKey: string;
  className: string;
  stream: string | null;
  section: string;
  dayOfWeek: number; // 1-5
  periodNumber: number; // matches PERIOD_SLOTS
  subjectRaw: string;
}

interface ParsedClassWise {
  classes: { className: string; stream: string | null }[];
  sections: { classKey: string; className: string; stream: string | null; section: string }[];
  cells: ClassWiseCell[];
}

function parseClassWiseSheet(registry: ClassCodeRegistry): ParsedClassWise {
  const rows = sheetRows(CLASS_WISE_FILE, "PRINT CLASS");
  const classes: ParsedClassWise["classes"] = [];
  const sections: ParsedClassWise["sections"] = [];
  const cells: ClassWiseCell[] = [];
  const seenClasses = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const c0 = cellStr(rows[i][0]);
    if (!c0.toUpperCase().startsWith("CLASS")) continue;

    const dayHeader = rows[i + 1];
    if (!dayHeader || cellStr(dayHeader[0]).toUpperCase() !== "DAY") continue;

    const { className, stream, section } = parseClassLabel(c0);
    if (!className) {
      throw new Error(`Class-wise sheet: could not parse class label "${c0}" at row ${i}`);
    }

    const classKey = stream ? `${className}|${stream}` : className;
    if (!seenClasses.has(classKey)) {
      seenClasses.add(classKey);
      classes.push({ className, stream });
    }
    sections.push({ classKey, className, stream, section });
    registry.register({ className, stream, section });

    for (let d = 0; d < 5; d++) {
      const dayRow = rows[i + 2 + 2 * d];
      if (!dayRow) continue;
      for (let col = 1; col <= 9; col++) {
        const subjectRaw = cellStr(dayRow[col]);
        if (!subjectRaw) continue;
        cells.push({
          classKey,
          className,
          stream,
          section,
          dayOfWeek: d + 1,
          periodNumber: EXCEL_PERIOD_TO_SLOT[col - 1],
          subjectRaw,
        });
      }
    }
  }

  return { classes, sections, cells };
}

// ---------------------------------------------------------------------------
// Teacher-wise sheet: teacher roster + per-cell (subject, class-code) for
// cross-validation against the class-wise sheet.
// ---------------------------------------------------------------------------

interface TeacherWiseCell {
  teacherName: string;
  dayOfWeek: number; // 1-5 (Saturday rows are parsed but dropped — schema has no day 6)
  periodNumber: number;
  subjectRaw: string;
  codeRaw: string;
}

function parseTeacherWiseSheet(): { teacherNames: string[]; cells: TeacherWiseCell[]; skippedBlocks: string[] } {
  const rows = sheetRows(TEACHER_WISE_FILE, "TIME TABLE");
  const teacherNames = new Set<string>();
  const cells: TeacherWiseCell[] = [];
  const skippedBlocks: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const c0 = cellStr(rows[i][0]);
    if (!/^(CLASS|TEACHER)/i.test(c0)) continue;

    const teacherName = cellStr(rows[i][7]);
    const dayHeader = rows[i + 1];
    if (!teacherName || !dayHeader || cellStr(dayHeader[0]).toUpperCase() !== "DAY") {
      skippedBlocks.push(`Row ${i}: "${c0}" (missing teacher name or DAY header)`);
      continue;
    }
    teacherNames.add(teacherName);

    for (let d = 0; d < 6; d++) {
      const subjectRow = rows[i + 2 + 2 * d];
      const codeRow = rows[i + 3 + 2 * d];
      if (!subjectRow || !codeRow) continue;
      if (cellStr(subjectRow[0]).toUpperCase() !== DAY_NAMES[d]) continue;
      if (d === 5) continue; // Saturday — schema only supports day_of_week 1-5

      for (let col = 1; col <= 9; col++) {
        const subjectRaw = cellStr(subjectRow[col]);
        const codeRaw = cellStr(codeRow[col]);
        if (!subjectRaw || /^F$/i.test(subjectRaw)) continue; // free period
        cells.push({
          teacherName,
          dayOfWeek: d + 1,
          periodNumber: EXCEL_PERIOD_TO_SLOT[col - 1],
          subjectRaw,
          codeRaw,
        });
      }
    }
  }

  return { teacherNames: [...teacherNames].sort(), cells, skippedBlocks };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

  const registry = new ClassCodeRegistry();

  console.log("Parsing Class-wise sheet...");
  const classWise = parseClassWiseSheet(registry);
  console.log(`  ${classWise.classes.length} classes, ${classWise.sections.length} sections, ${classWise.cells.length} scheduled cells`);

  console.log("Parsing Teacher-wise sheet...");
  const teacherWise = parseTeacherWiseSheet();
  console.log(`  ${teacherWise.teacherNames.length} teachers, ${teacherWise.cells.length} scheduled cells`);
  if (teacherWise.skippedBlocks.length) {
    console.log(`  Skipped ${teacherWise.skippedBlocks.length} malformed block(s) — see report.`);
  }

  // --- 1. period_slots ---------------------------------------------------
  console.log("Upserting period_slots...");
  const { error: periodSlotsError } = await supabase
    .from("period_slots")
    .upsert(PERIOD_SLOTS as unknown as Database["public"]["Tables"]["period_slots"]["Insert"][], {
      onConflict: "period_number",
    });
  if (periodSlotsError) throw periodSlotsError;

  const { data: periodSlotRows, error: periodSlotsFetchError } = await supabase
    .from("period_slots")
    .select("id, period_number");
  if (periodSlotsFetchError) throw periodSlotsFetchError;
  const periodSlotIdByNumber = new Map(periodSlotRows!.map((p) => [p.period_number, p.id]));

  // --- 2. classes ------------------------------------------------------------
  // Not a plain upsert: Postgres unique constraints never consider two NULLs
  // equal, so `ON CONFLICT (name, stream)` silently fails to match existing
  // rows whenever stream IS NULL (every class except XI/XII) — it would
  // insert a fresh duplicate on every re-run instead of updating. Matching
  // "name + stream-or-null" ourselves sidesteps that.
  console.log("Upserting classes...");
  const classInserts = classWise.classes.map((c) => ({
    name: c.className,
    stream: c.stream,
    display_order: GRADE_ORDER.indexOf(c.className),
  }));
  const classNaturalKey = (c: { name: string; stream: string | null }) => `${c.name}|${c.stream ?? ""}`;

  const { data: existingClasses, error: existingClassesError } = await supabase
    .from("classes")
    .select("id, name, stream");
  if (existingClassesError) throw existingClassesError;
  const existingClassIdByKey = new Map(existingClasses!.map((c) => [classNaturalKey(c), c.id]));

  const classesToInsert = classInserts.filter((c) => !existingClassIdByKey.has(classNaturalKey(c)));
  if (classesToInsert.length > 0) {
    const { data: insertedClasses, error: insertClassesError } = await supabase
      .from("classes")
      .insert(classesToInsert)
      .select("id, name, stream");
    if (insertClassesError) throw insertClassesError;
    for (const c of insertedClasses!) existingClassIdByKey.set(classNaturalKey(c), c.id);
  }

  const classIdByKey = new Map(
    classInserts.map((c) => [
      c.stream ? `${c.name}|${c.stream}` : c.name,
      existingClassIdByKey.get(classNaturalKey(c))!,
    ])
  );

  // --- 3. sections -----------------------------------------------------------
  console.log("Upserting sections...");
  const sectionInserts = classWise.sections.map((s) => ({
    class_id: classIdByKey.get(s.classKey)!,
    name: s.section,
  }));
  const { data: sectionRows, error: sectionsError } = await supabase
    .from("sections")
    .upsert(sectionInserts, { onConflict: "class_id,name" })
    .select("id, class_id, name");
  if (sectionsError) throw sectionsError;

  const classKeyByClassIdAndName = new Map(
    classWise.sections.map((s) => [`${classIdByKey.get(s.classKey)}::${s.section}`, s.classKey])
  );
  const sectionIdByClassKeyAndName = new Map(
    sectionRows!.map((s) => {
      const classKey = classKeyByClassIdAndName.get(`${s.class_id}::${s.name}`);
      return [`${classKey}::${s.name}`, s.id];
    })
  );

  // --- 4. subjects -----------------------------------------------------------
  console.log("Normalizing & upserting subjects...");
  const subjectMap = new Map<string, { name: string; category: "academic" | "games" }>();
  for (const cell of classWise.cells) {
    const n = normalizeSubject(cell.subjectRaw);
    if (n) subjectMap.set(n.name, { name: n.name, category: n.category });
  }
  const subjectInserts = [...subjectMap.values()];
  const { data: subjectRows, error: subjectsError } = await supabase
    .from("subjects")
    .upsert(subjectInserts, { onConflict: "name" })
    .select("id, name");
  if (subjectsError) throw subjectsError;
  const subjectIdByName = new Map(subjectRows!.map((s) => [s.name, s.id]));

  // --- 5. timetable_entries (subject only, teacher_id left null) -------------
  console.log("Upserting timetable_entries...");
  const entryInserts = [];
  for (const cell of classWise.cells) {
    const normalized = normalizeSubject(cell.subjectRaw);
    if (!normalized) continue;
    const sectionId = sectionIdByClassKeyAndName.get(`${cell.classKey}::${cell.section}`);
    const periodSlotId = periodSlotIdByNumber.get(cell.periodNumber);
    if (!sectionId || !periodSlotId) continue;
    entryInserts.push({
      section_id: sectionId,
      day_of_week: cell.dayOfWeek,
      period_slot_id: periodSlotId,
      subject_id: subjectIdByName.get(normalized.name) ?? null,
      teacher_id: null,
      is_practical: normalized.isPractical,
    });
  }
  const { error: entriesError } = await supabase
    .from("timetable_entries")
    .upsert(entryInserts, { onConflict: "section_id,day_of_week,period_slot_id" });
  if (entriesError) throw entriesError;
  console.log(`  ${entryInserts.length} timetable_entries upserted.`);

  // --- 6. cross-validation against teacher-wise sheet -------------------------
  console.log("Cross-validating against Teacher-wise sheet...");
  const teacherCellIndex = new Map<string, { teacherName: string; subjectRaw: string }[]>();
  const unresolvedCodes: { teacherName: string; codeRaw: string; day: number; period: number }[] = [];

  for (const cell of teacherWise.cells) {
    const keys = registry.decode(cell.codeRaw);
    if (!keys) {
      unresolvedCodes.push({
        teacherName: cell.teacherName,
        codeRaw: cell.codeRaw,
        day: cell.dayOfWeek,
        period: cell.periodNumber,
      });
      continue;
    }
    for (const key of keys) {
      const idxKey = `${cell.dayOfWeek}|${cell.periodNumber}|${key}`;
      const list = teacherCellIndex.get(idxKey) ?? [];
      list.push({ teacherName: cell.teacherName, subjectRaw: cell.subjectRaw });
      teacherCellIndex.set(idxKey, list);
    }
  }

  const mismatches: Record<string, unknown>[] = [];
  const ambiguous: Record<string, unknown>[] = [];
  let confirmed = 0;
  let unmatchedCount = 0;

  for (const cell of classWise.cells) {
    const classWiseNormalized = normalizeSubject(cell.subjectRaw);
    if (!classWiseNormalized) continue;
    const registryEntry = { className: cell.className, stream: cell.stream, section: cell.section };
    const key = cell.stream
      ? `${cell.className}${cell.stream[0]}`
      : cell.className === "Nursery"
        ? "NUR"
        : `${cell.className}${cell.section}`;
    const idxKey = `${cell.dayOfWeek}|${cell.periodNumber}|${key}`;
    const matches = teacherCellIndex.get(idxKey) ?? [];

    if (matches.length === 0) {
      unmatchedCount++;
    } else if (matches.length === 1) {
      const teacherSubject = normalizeSubject(matches[0].subjectRaw);
      const isGenericPracticalMatch =
        classWiseNormalized.isPractical &&
        teacherSubject &&
        GENERIC_PRACTICAL_LABELS.has(teacherSubject.name);
      if ((teacherSubject && teacherSubject.name === classWiseNormalized.name) || isGenericPracticalMatch) {
        confirmed++;
      } else {
        mismatches.push({
          section: `${cell.className}${cell.stream ? ` (${cell.stream})` : ""} ${cell.section}`,
          day: cell.dayOfWeek,
          period: cell.periodNumber,
          classWiseSubject: classWiseNormalized.name,
          teacherWiseSubject: teacherSubject?.name ?? matches[0].subjectRaw,
          teacherName: matches[0].teacherName,
          registryEntry,
        });
      }
    } else {
      ambiguous.push({
        section: `${cell.className}${cell.stream ? ` (${cell.stream})` : ""} ${cell.section}`,
        day: cell.dayOfWeek,
        period: cell.periodNumber,
        classWiseSubject: classWiseNormalized.name,
        candidates: matches,
      });
    }
  }

  // Dedupe unresolved codes for a readable report (many repeats across the week)
  const unresolvedSummary = new Map<string, number>();
  for (const u of unresolvedCodes) {
    const k = u.codeRaw;
    unresolvedSummary.set(k, (unresolvedSummary.get(k) ?? 0) + 1);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    classesUpserted: classInserts.length,
    sectionsUpserted: sectionInserts.length,
    subjectsUpserted: subjectInserts.length,
    timetableEntriesUpserted: entryInserts.length,
    crossValidation: {
      confirmed,
      unmatched: unmatchedCount,
      mismatches,
      ambiguous,
      unresolvedCodes: [...unresolvedSummary.entries()].map(([code, count]) => ({ code, count })),
    },
    teacherWiseSkippedBlocks: teacherWise.skippedBlocks,
    teacherRosterFromTeacherWiseSheet: teacherWise.teacherNames,
    note: "teacher_id was left null on every timetable_entries row — create real accounts via /admin/teachers, then run the teacher-linking pass once emails exist.",
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`\nDone. Report written to ${path.relative(process.cwd(), REPORT_FILE)}`);
  console.log(
    `Cross-validation: ${confirmed} confirmed, ${unmatchedCount} unmatched, ${mismatches.length} mismatches, ${ambiguous.length} ambiguous, ${unresolvedSummary.size} distinct unresolved codes.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
