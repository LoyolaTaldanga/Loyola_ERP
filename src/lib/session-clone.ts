import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

type Client = SupabaseClient<Database>;

export interface CloneResult {
  error: string | null;
  classesCloned: number;
  sectionsCloned: number;
  entriesCloned: number;
}

const CHUNK_SIZE = 500;

/**
 * Deep-clones classes/sections/timetable_entries from sourceSessionId into
 * newSessionId (an already-created draft session). Plain, framework-free —
 * called by the "Create New Session" server action, kept separate so the
 * clone logic itself can be exercised directly in a script/test without
 * going through getCurrentUser()/cookies().
 *
 * Ids are freshly generated (not reused) before inserting, so a clone can
 * never share a row with its source — editing one can never mutate the
 * other. sections/timetable_entries never need session_id set explicitly:
 * a DB trigger derives it from class_id/section_id respectively.
 */
export async function cloneSessionData(admin: Client, sourceSessionId: string, newSessionId: string): Promise<CloneResult> {
  const EMPTY = { classesCloned: 0, sectionsCloned: 0, entriesCloned: 0 };

  const { data: classes, error: classesError } = await admin
    .from("classes")
    .select("id, name, stream, display_order")
    .eq("session_id", sourceSessionId);
  if (classesError) return { error: classesError.message, ...EMPTY };

  const classIdMap = new Map<string, string>();
  const classInserts = (classes ?? []).map((c) => {
    const newId = randomUUID();
    classIdMap.set(c.id, newId);
    return { id: newId, name: c.name, stream: c.stream, display_order: c.display_order, session_id: newSessionId };
  });
  if (classInserts.length > 0) {
    const { error } = await admin.from("classes").insert(classInserts);
    if (error) return { error: error.message, ...EMPTY };
  }

  const { data: sections, error: sectionsError } = await admin
    .from("sections")
    .select("id, class_id, name, class_teacher_id")
    .eq("session_id", sourceSessionId);
  if (sectionsError) return { error: sectionsError.message, classesCloned: classInserts.length, sectionsCloned: 0, entriesCloned: 0 };

  const sectionIdMap = new Map<string, string>();
  const sectionInserts = (sections ?? []).map((s) => {
    const newId = randomUUID();
    sectionIdMap.set(s.id, newId);
    return {
      id: newId,
      class_id: classIdMap.get(s.class_id)!,
      name: s.name,
      // Copied verbatim as a starting value (same global teacher id).
      class_teacher_id: s.class_teacher_id,
    };
  });
  for (let i = 0; i < sectionInserts.length; i += CHUNK_SIZE) {
    const { error } = await admin.from("sections").insert(sectionInserts.slice(i, i + CHUNK_SIZE));
    if (error) return { error: error.message, classesCloned: classInserts.length, sectionsCloned: 0, entriesCloned: 0 };
  }

  // PostgREST caps a plain .select() at 1000 rows — this table can easily
  // exceed that (Loyola's own 2026-27 session has 2200+), so page through it
  // instead of trusting one call to return everything.
  type SourceEntry = { section_id: string; day_of_week: number; period_slot_id: string; subject_id: string | null; teacher_id: string | null; is_practical: boolean };
  const entries: SourceEntry[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error: entriesError } = await admin
      .from("timetable_entries")
      .select("section_id, day_of_week, period_slot_id, subject_id, teacher_id, is_practical")
      .eq("session_id", sourceSessionId)
      .range(from, from + PAGE_SIZE - 1);
    if (entriesError) {
      return { error: entriesError.message, classesCloned: classInserts.length, sectionsCloned: sectionInserts.length, entriesCloned: 0 };
    }
    entries.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }

  const entryInserts = (entries ?? []).map((e) => ({
    section_id: sectionIdMap.get(e.section_id)!,
    day_of_week: e.day_of_week,
    period_slot_id: e.period_slot_id,
    subject_id: e.subject_id,
    teacher_id: e.teacher_id,
    is_practical: e.is_practical,
  }));
  for (let i = 0; i < entryInserts.length; i += CHUNK_SIZE) {
    const { error } = await admin.from("timetable_entries").insert(entryInserts.slice(i, i + CHUNK_SIZE));
    if (error) {
      return { error: error.message, classesCloned: classInserts.length, sectionsCloned: sectionInserts.length, entriesCloned: 0 };
    }
  }

  return { error: null, classesCloned: classInserts.length, sectionsCloned: sectionInserts.length, entriesCloned: entryInserts.length };
}
