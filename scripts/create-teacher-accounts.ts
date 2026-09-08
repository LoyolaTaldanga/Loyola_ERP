// One-time (but re-runnable) bulk creator for teacher accounts, sourced from
// the teacher roster already extracted into scripts/import-report.json by
// import-excel.ts (itself read from the Teacher-wise Excel file). Skips any
// name that already has a `teachers` row, so it's safe to re-run after
// fixing a name or adding stragglers.
//
// `group` (A = mainly Nursery-V, B = mainly VI-XII) has no direct source in
// the Excel data, so it's derived from teacherGradeBandCounts (how many of a
// teacher's confirmed periods fall in each band) — a best-effort default,
// not a guarantee. Anything close to a 50/50 split is flagged in the output
// for the Principal to double-check.
//
// Usage: npm run create:teachers

import * as path from "node:path";
import * as fs from "node:fs";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database, TeacherGroup } from "../src/lib/supabase/types";
import { generateUniqueUsername, syntheticEmailFor } from "../src/lib/username";
import { generateTempPassword } from "../src/lib/password";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const REPORT_FILE = path.join(process.cwd(), "scripts/import-report.json");
const CREDENTIALS_FILE = path.join(process.cwd(), "docs/references/teacher-credentials.md");

interface ImportReport {
  teacherRosterFromTeacherWiseSheet: string[];
  teacherGradeBandCounts: Record<string, { junior: number; senior: number }>;
}

function deriveGroup(counts: { junior: number; senior: number } | undefined): { group: TeacherGroup; uncertain: boolean } {
  if (!counts || counts.junior + counts.senior === 0) {
    return { group: "B", uncertain: true };
  }
  const total = counts.junior + counts.senior;
  const juniorShare = counts.junior / total;
  const uncertain = Math.abs(juniorShare - 0.5) < 0.15; // within 15pp of a 50/50 split
  return { group: juniorShare >= 0.5 ? "A" : "B", uncertain };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8")) as ImportReport;

  const { data: existing, error: existingError } = await supabase.from("teachers").select("name");
  if (existingError) throw existingError;
  const existingNames = new Set(existing!.map((t) => t.name.trim().toUpperCase()));

  const toCreate = report.teacherRosterFromTeacherWiseSheet.filter(
    (name) => !existingNames.has(name.trim().toUpperCase())
  );

  console.log(`${report.teacherRosterFromTeacherWiseSheet.length} teachers in roster, ${toCreate.length} to create.`);

  const created: { name: string; username: string; password: string; group: TeacherGroup; note: string }[] = [];

  for (const name of toCreate) {
    const { group, uncertain } = deriveGroup(report.teacherGradeBandCounts[name]);

    const username = await generateUniqueUsername(name, async (candidate) => {
      const { count } = await supabase
        .from("teachers")
        .select("id", { count: "exact", head: true })
        .eq("username", candidate);
      return (count ?? 0) > 0;
    });
    const email = syntheticEmailFor(username);
    const password = generateTempPassword();

    const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "teacher" },
    });
    if (createError || !authUser.user) {
      console.error(`  FAILED to create auth user for "${name}": ${createError?.message}`);
      continue;
    }

    const { error: insertError } = await supabase.from("teachers").insert({
      id: authUser.user.id,
      name,
      email,
      username,
      group,
      group_needs_review: uncertain,
    });
    if (insertError) {
      console.error(`  FAILED to insert teachers row for "${name}": ${insertError.message}`);
      await supabase.auth.admin.deleteUser(authUser.user.id);
      continue;
    }

    created.push({
      name,
      username,
      password,
      group,
      note: uncertain ? "verify group — periods were close to an even junior/senior split" : "",
    });
    console.log(`  Created ${username} (${name}, group ${group}${uncertain ? ", UNCERTAIN" : ""})`);
  }

  if (created.length === 0) {
    console.log("Nothing new to create.");
    return;
  }

  fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true });
  const existingDoc = fs.existsSync(CREDENTIALS_FILE) ? fs.readFileSync(CREDENTIALS_FILE, "utf-8") : "";
  const header = `# Teacher credentials — ${new Date().toISOString()}

**CONTAINS PLAINTEXT PASSWORDS. Do not commit. Delete this file (or rotate every password in it)
once the Principal has distributed these to each teacher.**

| Name | User ID | Temporary Password | Group | Notes |
|---|---|---|---|---|
`;
  const rows = created
    .map((c) => `| ${c.name} | \`${c.username}\` | \`${c.password}\` | ${c.group} | ${c.note} |`)
    .join("\n");

  fs.writeFileSync(CREDENTIALS_FILE, existingDoc + (existingDoc ? "\n\n" : "") + header + rows + "\n");

  console.log(`\n⚠️  ${created.length} account(s) created. Credentials written to ${path.relative(process.cwd(), CREDENTIALS_FILE)}`);
  console.log("⚠️  That file contains PLAINTEXT PASSWORDS — distribute them, then delete the file or reset each password.");
  const uncertainCount = created.filter((c) => c.note).length;
  if (uncertainCount > 0) {
    console.log(`⚠️  ${uncertainCount} teacher(s) had an ambiguous junior/senior split — double check their group in /admin/teachers.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
