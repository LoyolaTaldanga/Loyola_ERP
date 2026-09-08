import type { TeacherGroup } from "./supabase/types";

const JUNIOR_GRADES = new Set(["Nursery", "LKG", "UKG", "I", "II", "III", "IV", "V"]);

/** Nursery-V -> group A, VI-XII -> group B — the same split teachers.group uses. */
export function gradeBandForClassName(className: string): TeacherGroup {
  return JUNIOR_GRADES.has(className) ? "A" : "B";
}
