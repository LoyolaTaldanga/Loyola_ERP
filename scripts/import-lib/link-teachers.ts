// Plain, framework-free implementation of "Link Teachers by Name", shared by
// the /admin/timetable server action (src/app/admin/timetable/actions.ts) and
// the standalone CLI runner (scripts/link-teachers-cli.ts). Deliberately has
// no "@/..." imports and no dependency on src/lib/supabase/admin.ts (which
// imports the "server-only" package — that throws unconditionally outside a
// Next.js server-component build, so it can never be imported from a plain
// tsx script) so it can run in both contexts unchanged.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/types";

type AdminClient = SupabaseClient<Database>;

export interface ReportMatch {
  className: string;
  stream: string | null;
  sectionName: string;
  dayOfWeek: number;
  periodNumber: number;
  teacherName: string;
}

export interface ImportReportForLinking {
  crossValidation: {
    confirmedMatches: ReportMatch[];
    mismatches: ReportMatch[];
  };
}

export interface LinkTeachersResult {
  error: string | null;
  linked: number;
  alreadySet: number;
  nameNotFound: string[];
  unresolvedSection: number;
}

function sectionKey(className: string, stream: string | null, sectionName: string): string {
  return `${className}|${stream ?? ""}|${sectionName}`;
}

// PostgREST caps a plain .select() at 1000 rows, so anything reading the
// whole table has to page through it with .range() instead of trusting one
// call to return everything.
async function fetchAllTimetableEntries(admin: AdminClient, sessionId: string) {
  const pageSize = 1000;
  const all: { id: string; section_id: string; day_of_week: number; period_slot_id: string; teacher_id: string | null }[] =
    [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("timetable_entries")
      .select("id, section_id, day_of_week, period_slot_id, teacher_id")
      .eq("session_id", sessionId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

export async function linkTeachersByNameCore(
  admin: AdminClient,
  report: ImportReportForLinking,
  sessionId: string
): Promise<LinkTeachersResult> {
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

  const existingEntries = await fetchAllTimetableEntries(admin, sessionId);
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
  // those need an explicit Admin pick via resolveAmbiguousSlot.
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

  return { error: null, linked, alreadySet, nameNotFound: [...nameNotFoundSet], unresolvedSection };
}
