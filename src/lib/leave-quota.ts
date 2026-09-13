import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeaveType } from "./supabase/types";

type Client = SupabaseClient<Database>;

export interface DateLeaveSuggestion {
  date: string;
  suggestedType: LeaveType;
}

export interface TeacherLeaveSummary {
  quota: number;
  casualTaken: number;
  casualLeft: number;
  totalPaid: number;
  /** 1-12, only months that actually have a paid-leave day. */
  paidByMonth: { month: number; count: number }[];
}

/** Inclusive list of YYYY-MM-DD dates from start to end. Built in UTC throughout so there's no DST drift across the range. */
export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur.getTime() <= last.getTime()) {
    dates.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

export async function getDefaultLeaveQuota(client: Client): Promise<number> {
  const { data } = await client.from("app_settings").select("value").eq("key", "default_annual_leave_quota").single();
  const value = data?.value;
  return typeof value === "number" ? value : 30;
}

export async function getEffectiveQuota(client: Client, teacherId: string): Promise<number> {
  const { data: teacher } = await client.from("teachers").select("leave_quota_override").eq("id", teacherId).single();
  if (teacher?.leave_quota_override != null) return teacher.leave_quota_override;
  return getDefaultLeaveQuota(client);
}

async function getCasualTakenInYear(client: Client, teacherId: string, year: number): Promise<number> {
  const { count } = await client
    .from("teacher_absences")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", teacherId)
    .eq("status", "full_day")
    .eq("leave_type", "casual")
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`);
  return count ?? 0;
}

/**
 * Splits a set of dates into casual/paid, computed independently PER CALENDAR
 * YEAR the dates fall in (a request spanning Dec 31 -> Jan 2 must not treat
 * both years as one shared pool) — preserves the caller's original date order.
 */
export async function suggestLeaveSplit(client: Client, teacherId: string, dates: string[]): Promise<DateLeaveSuggestion[]> {
  const byYear = new Map<number, string[]>();
  for (const d of dates) {
    const year = Number(d.slice(0, 4));
    const list = byYear.get(year) ?? [];
    list.push(d);
    byYear.set(year, list);
  }

  const quota = await getEffectiveQuota(client, teacherId);
  const suggestionByDate = new Map<string, LeaveType>();
  for (const [year, yearDates] of byYear) {
    const taken = await getCasualTakenInYear(client, teacherId, year);
    const remaining = Math.max(0, quota - taken);
    const sorted = [...yearDates].sort();
    sorted.forEach((date, i) => {
      suggestionByDate.set(date, i < remaining ? "casual" : "paid");
    });
  }

  return dates.map((date) => ({ date, suggestedType: suggestionByDate.get(date)! }));
}

// Core aggregation, reused by both the single-teacher and bulk-summary paths
// below so there is exactly one place that turns raw absence rows into totals.
function aggregateLeave(rows: { date: string; leave_type: LeaveType | null }[], quota: number): TeacherLeaveSummary {
  let casualTaken = 0;
  const paidByMonthMap = new Map<number, number>();
  for (const r of rows) {
    if (r.leave_type === "casual") casualTaken++;
    else if (r.leave_type === "paid") {
      const month = Number(r.date.slice(5, 7));
      paidByMonthMap.set(month, (paidByMonthMap.get(month) ?? 0) + 1);
    }
  }
  const totalPaid = [...paidByMonthMap.values()].reduce((a, b) => a + b, 0);
  const paidByMonth = [...paidByMonthMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([month, count]) => ({ month, count }));
  return { quota, casualTaken, casualLeft: Math.max(0, quota - casualTaken), totalPaid, paidByMonth };
}

/** The single shared calculation both /admin/teachers/[id] and /dashboard call directly — identical figures by construction. */
export async function getTeacherLeaveSummary(
  client: Client,
  teacherId: string,
  year: number = new Date().getFullYear()
): Promise<TeacherLeaveSummary> {
  const quota = await getEffectiveQuota(client, teacherId);
  const { data } = await client
    .from("teacher_absences")
    .select("date, leave_type")
    .eq("teacher_id", teacherId)
    .eq("status", "full_day")
    .not("leave_type", "is", null)
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`);
  return aggregateLeave(data ?? [], quota);
}

/** One query for all active teachers' quota + one query for all their absences in the year (not N+1) — powers /admin/leave-summary. */
export async function getAllTeacherLeaveSummaries(
  client: Client,
  year: number = new Date().getFullYear()
): Promise<Map<string, TeacherLeaveSummary>> {
  const defaultQuota = await getDefaultLeaveQuota(client);
  const { data: teachers } = await client
    .from("teachers")
    .select("id, leave_quota_override")
    .eq("is_active", true);

  const { data: absences } = await client
    .from("teacher_absences")
    .select("teacher_id, date, leave_type")
    .eq("status", "full_day")
    .not("leave_type", "is", null)
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`);

  const rowsByTeacher = new Map<string, { date: string; leave_type: LeaveType | null }[]>();
  for (const a of absences ?? []) {
    const list = rowsByTeacher.get(a.teacher_id) ?? [];
    list.push({ date: a.date, leave_type: a.leave_type });
    rowsByTeacher.set(a.teacher_id, list);
  }

  const result = new Map<string, TeacherLeaveSummary>();
  for (const t of teachers ?? []) {
    const quota = t.leave_quota_override ?? defaultQuota;
    result.set(t.id, aggregateLeave(rowsByTeacher.get(t.id) ?? [], quota));
  }
  return result;
}
