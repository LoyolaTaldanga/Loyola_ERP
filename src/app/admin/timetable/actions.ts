"use server";

import * as fs from "node:fs";
import * as path from "node:path";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSubject } from "@/lib/subject-normalize";
// The actual matching/upsert logic lives in scripts/import-lib/link-teachers.ts
// (a plain module with no "use server"/next/* imports) so the exact same code
// can run here and from scripts/link-teachers-cli.ts during a bulk re-import —
// src/lib/supabase/admin.ts imports the "server-only" package, which throws
// unconditionally outside a Next.js server build, so this file's helpers can
// never be called directly from a standalone script.
import { linkTeachersByNameCore, type LinkTeachersResult } from "../../../../scripts/import-lib/link-teachers";
import { assertSessionEditable } from "@/lib/session-context";

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

async function loadLookups(admin: AdminClient, sessionId: string) {
  const { data: sections } = await admin.from("sections").select("id, name, classes(name, stream)").eq("session_id", sessionId);
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

export async function linkTeachersByName(sessionId: string): Promise<LinkTeachersResult> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    return { error: "Not authorized.", linked: 0, alreadySet: 0, nameNotFound: [], unresolvedSection: 0 };
  }
  const admin = createAdminClient();
  try {
    await assertSessionEditable(admin, sessionId);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Session is not editable.",
      linked: 0,
      alreadySet: 0,
      nameNotFound: [],
      unresolvedSection: 0,
    };
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
  const result = await linkTeachersByNameCore(admin, report, sessionId);
  revalidatePath("/admin/timetable");
  return result;
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
  sessionId: string;
}

export async function resolveAmbiguousSlot(input: ResolveAmbiguousInput): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized." };

  const admin = createAdminClient();
  try {
    await assertSessionEditable(admin, input.sessionId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Session is not editable." };
  }
  const { sectionIdByKey, periodSlotIdByNumber, teacherIdByName } = await loadLookups(admin, input.sessionId);

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
  const { data: section } = await admin.from("sections").select("session_id").eq("id", sectionId).single();
  if (!section) return { error: "Section not found." };
  try {
    await assertSessionEditable(admin, section.session_id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Session is not editable." };
  }

  const { periodSlotIdByNumber, teacherIdByName, subjectIdByName } = await loadLookups(admin, section.session_id);
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
  const { data: cls } = await admin.from("classes").select("session_id").eq("id", classId).single();
  if (!cls) return { error: "Class not found." };
  try {
    await assertSessionEditable(admin, cls.session_id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Session is not editable." };
  }

  const { data: section, error: insertError } = await admin
    .from("sections")
    .insert({ class_id: classId, name: newSectionName.trim().toUpperCase() })
    .select("id")
    .single();
  if (insertError || !section) {
    return { error: insertError?.message ?? "Could not create the section." };
  }

  const { periodSlotIdByNumber, teacherIdByName, subjectIdByName } = await loadLookups(admin, cls.session_id);
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
