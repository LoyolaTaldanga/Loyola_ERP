"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubstitutionRule } from "@/lib/supabase/types";

export interface UpdateRuleInput {
  ruleId: string;
  isActive?: boolean;
  priorityOrder?: number;
  config?: Record<string, unknown>;
}

export async function updateRule(input: UpdateRuleInput): Promise<{ error: string | null }> {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return { error: "Not authorized." };

  const patch: Partial<SubstitutionRule> = {};
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.priorityOrder !== undefined) patch.priority_order = input.priorityOrder;
  if (input.config !== undefined) patch.config = input.config;
  if (Object.keys(patch).length === 0) return { error: null };

  const admin = createAdminClient();
  const { error } = await admin.from("substitution_rules").update(patch).eq("id", input.ruleId);
  if (error) return { error: error.message };

  // The engine reads substitution_rules fresh on every call (no caching),
  // so this takes effect on the very next absence marked — nothing else to
  // invalidate.
  revalidatePath("/admin/rules");
  return { error: null };
}
