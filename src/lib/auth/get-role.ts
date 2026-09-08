import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/supabase/types";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const role: Role = (user.app_metadata?.role as Role | undefined) ?? "teacher";
  return { user, role };
}
