// One-time (re-runnable) population of teacher_subjects, derived from the
// timetable itself: if a teacher currently teaches a subject anywhere per
// timetable_entries, that's a real (teacher, subject) qualification fact.
// Needed for Phase 3's auto-assignment engine, whose "primary path" (Step 2)
// depends entirely on this table having real data.
//
// Usage: npm run populate:teacher-subjects

import * as path from "node:path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

  // PostgREST caps a plain .select() at 1000 rows — page through it.
  const pairs = new Set<string>();
  const rows: { teacher_id: string; subject_id: string; is_primary: boolean }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("timetable_entries")
      .select("teacher_id, subject_id")
      .not("teacher_id", "is", null)
      .not("subject_id", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const e of data ?? []) {
      const key = `${e.teacher_id}|${e.subject_id}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      rows.push({ teacher_id: e.teacher_id!, subject_id: e.subject_id!, is_primary: false });
    }
    if (!data || data.length < pageSize) break;
  }

  console.log(`${rows.length} distinct (teacher, subject) pairs found in the timetable.`);

  const { error: upsertError } = await supabase
    .from("teacher_subjects")
    .upsert(rows, { onConflict: "teacher_id,subject_id" });
  if (upsertError) throw upsertError;

  const { count } = await supabase.from("teacher_subjects").select("*", { count: "exact", head: true });
  console.log(`Done. teacher_subjects now has ${count} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
