// Standalone (re-runnable) creator for the Principal's admin account. Unlike
// teachers, the admin has no `teachers` row — admin status is carried purely
// in the Supabase auth user's app_metadata ({"role": "admin"}), per this
// schema's own design (see supabase/migrations/20260908010000_init_schema.sql's
// header comment: "There is no separate admins table").
//
// Email/password are never hardcoded — pass them as CLI args or env vars:
//   npx tsx scripts/create-admin.ts --email admin@example.com --password 'Some$trongPass1'
//   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='Some$trongPass1' npx tsx scripts/create-admin.ts
//
// Safe to re-run: if a user with that email already exists, this just
// promotes them to role=admin instead of failing.

import * as path from "node:path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

function readArg(flag: string): string | undefined {
  const prefix = `--${flag}`;
  const exact = process.argv.find((a) => a === prefix);
  if (exact) {
    const i = process.argv.indexOf(exact);
    return process.argv[i + 1];
  }
  const inline = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return inline?.slice(prefix.length + 1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }

  const email = readArg("email") || process.env.ADMIN_EMAIL;
  const password = readArg("password") || process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      "Usage: npx tsx scripts/create-admin.ts --email <email> --password <password>\n" +
        "       (or set ADMIN_EMAIL / ADMIN_PASSWORD env vars)"
    );
    process.exit(1);
  }

  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

  // Paged lookup by email — supabase-js has no direct getUserByEmail.
  let existing: { id: string; email?: string } | undefined;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing || data.users.length < 1000) break;
  }

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: { role: "admin" },
    });
    if (error) throw error;
    console.log(`Promoted existing user ${email} (${existing.id}) to role=admin and reset the password.`);
    return;
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (createError || !created.user) throw createError ?? new Error("Could not create the admin user.");

  console.log(`Created admin user ${email} (${created.user.id}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
