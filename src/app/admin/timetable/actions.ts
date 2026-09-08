"use server";

import * as fs from "node:fs";
import * as path from "node:path";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSubject } from "@/lib/subject-normalize";

const REPORT_FILE = path.join(process.cwd(), "scripts/import-report.json");

interface ReportMatch {
  className: string;
  stream: string | null;
  sectionName: string;
  dayOfWeek: number;
  periodNumber: number;
  teacherName: string;
}

interface ReportOccurrence {
  teacherName: string;
  codeRaw: string;
  day: number;
  period: number;
  subjectRaw: string;
}

interface ImportReport {
  crossValidation: {
    confirmedMatches: ReportMatch[];
    mismatches: ReportMatch[];
    unresolvedCodeOccurrences: ReportOccurrence[];
  };
}

function readReport(): ImportReport | null {
  try {
    return JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function sectionKey(className: string, stream: string | null, sectionName: string): string {
  return `${className}|${stream ?? ""}|${sectionName}`;
}

type AdminClient = ReturnType<typeof createAdminClient>;

// PostgREST caps a plain .select() at 1000 rows (this project's ~1900
// timetable_entries exceeds that), so anything reading the whole table has
// to page through it with .range() instead of trusting one call to return
// everything.
async function fetchAllTimetableEntries(admin: AdminClient) {
  const pageSize = 1000;
  const all: { id: string; section_id: string; day_of_week: number; period_slot_id: string; teacher_id: string | null }[] =
    [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("timetable_entries")
      .select("id, section_id, day_of_week, period_slot_id, teacher_id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

async function loadLookups(admin: AdminClient) {
  const { data: sections } = await admin.from("sections").select("id, name, classes(name, stream)");
  const sectionIdByKey = new Map<string, string>();
  for (const s of sections ?? []) {
    const cls = s.classes as unknown as { name: string; stream: string | null } | null;
    if (!cls) continue;
    sectionIdByKey.set(sectionKey(cls.name, cls.stream, s.name), s.id);
  }

  const { data: periodSlots } = await admin.from("period_slots").select("id, period_number");
  const periodSlotIdByNumber = new Map((periodSlots ?? []).map((p) => [p.period_number, p.id]));

  const { data: teachers } = await admin.from("teachers").select("id, name");
  const teacherIdByName = new Map((teachers ?? []).map((t) => [t.name.trim().toUpperCase(), t.id]));

  const { data: subjects } = await admin.from("subjects").select("id, name");
  const subjectIdByName = new Map((subjects ?? []).map((s) => [s.name, s.id]));

  return { sectionIdByKey, periodSlotIdByNumber, teacherIdByName, subjectIdByName };
}

// ---------------------------------------------------------------------------
// Bulk "Link Teachers by Name"
// ---------------------------------------------------------------------------

export interface LinkTeachersResult {
  error: string | null;
  linked: number;
  alreadySet: number;
  nameNotFound: string[];
  unresolvedSection: number;
}

export async function linkTeachersByName(): Promise<LinkTeachersResult> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return { error: "Not authorized.", linked: 0, alreadySet: 0, nameNotFound: [], unresolvedSection: 0 };
  }

  const report = readReport();
  if (!report) {
    return {
      error: "No import report found — run the Excel importer first.",
      linked: 0,
      alreadySet: 0,
      nameNotFound: [],
      unresolvedSection: 0,
    };
  }

  const admin = createAdminClient();
  const { sectionIdByKey, periodSlotIdByNumber, teacherIdByName } = await loadLookups(admin);

  const existingEntries = await fetchAllTimetableEntries(admin);
  const entryByKey = new Map(existingEntries.map((e) => [`${e.section_id}|${e.day_of_week}|${e.period_slot_id}`, e]));

  let alreadySet = 0;
  let unresolvedSection = 0;
  const nameNotFoundSet = new Set<string>();
  const updates: { section_id: string; day_of_week: number; period_slot_id: string; teacher_id: string }[] = [];

  // confirmedMatches (subject agreed) and mismatches (subject text differed,
  // but the teacher identity for that slot isn't in question — class-wise
  // subject was already trusted as authoritative at import time) both give
  // high-confidence teacher assignments. Ambiguous slots (multiple different
  // teacher-wise names for the same section/day/period) are excluded here —
  // those need an explicit Admin pick, see resolveAmbiguousSlot below.
  const candidates = [...report.crossValidation.confirmedMatches, ...report.crossValidation.mismatches];

  for (const m of candidates) {
    const sectionId = sectionIdByKey.get(sectionKey(m.className, m.stream, m.sectionName));
    const periodSlotId = periodSlotIdByNumber.get(m.periodNumber);
    if (!sectionId || !periodSlotId) {
      unresolvedSection++;
      continue;
    }
    const entry = entryByKey.get(`${sectionId}|${m.dayOfWeek}|${periodSlotId}`);
    if (!entry || entry.teacher_id) {
      if (entry?.teacher_id) alreadySet++;
      continue;
    }
    const teacherId = teacherIdByName.get(m.teacherName.trim().toUpperCase());
    if (!teacherId) {
      nameNotFoundSet.add(m.teacherName);
      continue;
    }
    updates.push({ section_id: sectionId, day_of_week: m.dayOfWeek, period_slot_id: periodSlotId, teacher_id: teacherId });
  }

  // A single bulk upsert (chunked to stay well under any request-size limit)
  // instead of one round-trip per row — this table can have thousands of
  // rows. Only the columns listed here are touched on conflict (verified:
  // PostgREST's merge-duplicates upsert leaves subject_id/is_practical
  // alone), and the ON CONFLICT target only ever matches existing rows in
  // this flow, so no bare-minimum INSERT branch is ever taken.
  let linked = 0;
  const CHUNK_SIZE = 500;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const { error } = await admin
      .from("timetable_entries")
      .upsert(chunk, { onConflict: "section_id,day_of_week,period_slot_id" });
    if (!error) linked += chunk.length;
  }

  revalidatePath("/admin/timetable");
  return { error: null, linked, alreadySet, nameNotFound: [...nameNotFoundSet], unresolvedSection };
}

// ---------------------------------------------------------------------------
// Ambiguous-slot resolution (Admin picks which of the candidate teachers)
// ---------------------------------------------------------------------------

export interface ResolveAmbiguousInput {
  className: string;
  stream: string | null;
  sectionName: string;
  dayOfWeek: number;
  periodNumber: number;
  teacherName: string;
}

export async function resolveAmbiguousSlot(input: ResolveAmbiguousInput): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized." };

  const admin = createAdminClient();
  const { sectionIdByKey, periodSlotIdByNumber, teacherIdByName } = await loadLookups(admin);

  const sectionId = sectionIdByKey.get(sectionKey(input.className, input.stream, input.sectionName));
  const periodSlotId = periodSlotIdByNumber.get(input.periodNumber);
  if (!sectionId || !periodSlotId) return { error: "Could not resolve that section/period." };

  const teacherId = teacherIdByName.get(input.teacherName.trim().toUpperCase());
  if (!teacherId) return { error: `No teacher account found for "${input.teacherName}".` };

  const { error } = await admin
    .from("timetable_entries")
    .update({ teacher_id: teacherId })
    .eq("section_id", sectionId)
    .eq("day_of_week", input.dayOfWeek)
    .eq("period_slot_id", periodSlotId);

  if (error) return { error: error.message };
  revalidatePath("/admin/timetable");
  return { error: null };
}

// ---------------------------------------------------------------------------
// Unresolved section-code resolution
// ---------------------------------------------------------------------------

async function applyCodeOccurrencesToSection(
  admin: AdminClient,
  codeRaw: string,
  sectionId: string,
  periodSlotIdByNumber: Map<number, string>,
  teacherIdByName: Map<string, string>,
  subjectIdByName: Map<string, string>
): Promise<number> {
  const report = readReport();
  if (!report) return 0;
  const occurrences = report.crossValidation.unresolvedCodeOccurrences.filter((o) => o.codeRaw === codeRaw);

  let applied = 0;
  for (const occ of occurrences) {
    const periodSlotId = periodSlotIdByNumber.get(occ.period);
    if (!periodSlotId) continue;
    const normalized = normalizeSubject(occ.subjectRaw);
    const subjectId = normalized ? (subjectIdByName.get(normalized.name) ?? null) : null;
    const teacherId = teacherIdByName.get(occ.teacherName.trim().toUpperCase()) ?? null;

    const { error } = await admin.from("timetable_entries").upsert(
      {
        section_id: sectionId,
        day_of_week: occ.day,
        period_slot_id: periodSlotId,
        subject_id: subjectId,
        teacher_id: teacherId,
        is_practical: normalized?.isPractical ?? false,
      },
      { onConflict: "section_id,day_of_week,period_slot_id" }
    );
    if (!error) applied++;
  }
  return applied;
}

export async function resolveUnresolvedCodeToExistingSection(
  codeRaw: string,
  sectionId: string
): Promise<{ error: string | null; applied?: number }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized." };

  const admin = createAdminClient();
  const { periodSlotIdByNumber, teacherIdByName, subjectIdByName } = await loadLookups(admin);
  const applied = await applyCodeOccurrencesToSection(
    admin,
    codeRaw,
    sectionId,
    periodSlotIdByNumber,
    teacherIdByName,
    subjectIdByName
  );
  revalidatePath("/admin/timetable");
  return { error: null, applied };
}

export async function resolveUnresolvedCodeToNewSection(
  codeRaw: string,
  classId: string,
  newSectionName: string
): Promise<{ error: string | null; applied?: number }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized." };
  if (!newSectionName.trim()) return { error: "Section name is required." };

  const admin = createAdminClient();
  const { data: section, error: insertError } = await admin
    .from("sections")
    .insert({ class_id: classId, name: newSectionName.trim().toUpperCase() })
    .select("id")
    .single();
  if (insertError || !section) {
    return { error: insertError?.message ?? "Could not create the section." };
  }

  const { periodSlotIdByNumber, teacherIdByName, subjectIdByName } = await loadLookups(admin);
  const applied = await applyCodeOccurrencesToSection(
    admin,
    codeRaw,
    section.id,
    periodSlotIdByNumber,
    teacherIdByName,
    subjectIdByName
  );
  revalidatePath("/admin/timetable");
  return { error: null, applied };
}
