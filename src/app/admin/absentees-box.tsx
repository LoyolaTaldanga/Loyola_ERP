import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/today";
import type { SubstitutionStatus } from "@/lib/supabase/types";

const STATUS_LABEL: Record<SubstitutionStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  confirmed: "Assigned",
  flagged_for_review: "Needs Review",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<SubstitutionStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  assigned: "bg-green-100 text-green-700",
  confirmed: "bg-green-100 text-green-700",
  flagged_for_review: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export async function AbsenteesBox() {
  const supabase = await createClient();
  const today = todayISO();

  const { data: absences } = await supabase
    .from("teacher_absences")
    .select("id, status, affected_periods, teachers!teacher_absences_teacher_id_fkey(name), substitutions(status)")
    .eq("date", today);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-brand-primary">Today&apos;s Absentees</h2>
        <Link href="/admin/absences" className="text-xs text-brand-primary hover:underline">
          Mark an absence →
        </Link>
      </div>

      {!absences?.length ? (
        <p className="mt-4 text-sm text-slate-400">No teachers marked absent today.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {absences.map((absence) => {
            const teacher = absence.teachers as unknown as { name: string } | null;
            const substitutions = (absence.substitutions ?? []) as unknown as { status: SubstitutionStatus }[];
            return (
              <li key={absence.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-slate-800">{teacher?.name ?? "Unknown teacher"}</p>
                  <p className="text-xs text-slate-500">
                    {absence.status === "full_day"
                      ? "Full day"
                      : `Periods: ${(absence.affected_periods ?? []).join(", ") || "—"}`}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {substitutions.length === 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      No substitutions yet
                    </span>
                  )}
                  {substitutions.map((s, i) => (
                    <span
                      key={i}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[s.status]}`}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                  ))}
                  <Link
                    href="/admin/substitutions"
                    className="ml-2 text-xs text-brand-primary hover:underline"
                  >
                    Manage →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
