import { createClient } from "@/lib/supabase/server";
import { getAllTeacherLeaveSummaries, getDefaultLeaveQuota } from "@/lib/leave-quota";
import { DefaultQuotaInput } from "./default-quota-input";
import { LeaveSummaryTable, type LeaveSummaryRow } from "./leave-summary-table";

export default async function LeaveSummaryPage() {
  const supabase = await createClient();
  const year = new Date().getFullYear();

  const [{ data: teachers }, summaries, defaultQuota] = await Promise.all([
    supabase.from("teachers").select("id, name").eq("is_active", true).order("name", { ascending: true }),
    getAllTeacherLeaveSummaries(supabase, year),
    getDefaultLeaveQuota(supabase),
  ]);

  const rows: LeaveSummaryRow[] = (teachers ?? []).map((t) => {
    const s = summaries.get(t.id);
    return {
      id: t.id,
      name: t.name,
      quota: s?.quota ?? defaultQuota,
      casualTaken: s?.casualTaken ?? 0,
      casualLeft: s?.casualLeft ?? defaultQuota,
      totalPaid: s?.totalPaid ?? 0,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Leave Summary — {year}</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Every active teacher&apos;s annual leave position at a glance. Click a column to sort.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <DefaultQuotaInput initialValue={defaultQuota} />
      </div>

      <div className="mt-6">
        <LeaveSummaryTable rows={rows} />
      </div>
    </div>
  );
}
