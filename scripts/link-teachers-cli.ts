// Standalone CLI runner for the "Link Teachers by Name" utility normally
// triggered from the /admin/timetable button — lets a bulk re-import script
// or verification pass run it and read back exact counts, the same way
// import-excel.ts itself runs outside the Next.js server via the
// service-role client.
//
// Usage: npx tsx scripts/link-teachers-cli.ts

import * as path from "node:path";
import * as fs from "node:fs";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import { linkTeachersByNameCore, type ImportReportForLinking } from "./import-lib/link-teachers";
import { getActiveSession, assertSessionEditable } from "../src/lib/session-context";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const REPORT_FILE = path.join(process.cwd(), "scripts/import-report.json");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }
  const admin = createClient<Database>(url, key, { auth: { persistSession: false } });

  // Defaults to whichever session is active — this is rarely re-run now that
  // "Create New Session" is the normal path for a new year, but stay correct
  // if it ever is.
  const sessionId = process.env.TARGET_SESSION_ID || (await getActiveSession(admin)).id;
  await assertSessionEditable(admin, sessionId);

  const report: ImportReportForLinking = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
  const result = await linkTeachersByNameCore(admin, report, sessionId);
  console.log(JSON.stringify(result, null, 2));
  if (result.error) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
