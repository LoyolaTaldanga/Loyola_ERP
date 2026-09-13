import { createClient } from "@/lib/supabase/server";
import { getActiveSession } from "@/lib/session-context";
import { LeaveRequestActions } from "./leave-request-actions";
import type { LeaveRequestStatus } from "@/lib/supabase/types";

const STATUS_LABEL: Record<LeaveRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<LeaveRequestStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-amber-100 text-amber-800",
};

export default async function AdminLeaveRequestsPage() {
  const supabase = await createClient();
  const activeSession = await getActiveSession(supabase);

  const { data: requests } = await supabase
    .from("leave_requests")
    .select("id, start_date, end_date, status, reason, requested_at, teachers(name)")
    .eq("session_id", activeSession.id)
    .order("requested_at", { ascending: false });

  const rows = (requests ?? []).map((r) => ({
    id: r.id,
    teacherName: (r.teachers as unknown as { name: string } | null)?.name ?? "Unknown",
    dates: r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`,
    status: r.status as LeaveRequestStatus,
    reason: r.reason,
    requestedAt: r.requested_at,
  }));

  const pending = rows.filter((r) => r.status === "pending");
  const rest = rows.filter((r) => r.status !== "pending");

  function table(items: typeof rows, emptyText: string) {
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Teacher</th>
              <th className="px-3 py-2 font-medium">Dates</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
              <th className="px-3 py-2 font-medium">Slip</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.teacherName}</td>
                <td className="px-3 py-2">{r.dates}</td>
                <td className="px-3 py-2">{r.reason ?? ""}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {(r.status === "pending" || r.status === "approved") && (
                    <LeaveRequestActions id={r.id} status={r.status} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.status === "approved" && (
                    <div className="flex gap-2 text-xs">
                      <a href={`/api/leave-requests/${r.id}/slip?format=xlsx`} className="text-brand-primary underline">
                        Excel
                      </a>
                      <a href={`/api/leave-requests/${r.id}/slip?format=pdf`} className="text-brand-primary underline">
                        PDF
                      </a>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Leave Requests</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Approving runs the same absence + auto-assignment flow as marking someone absent directly,
        once per date in the request.
      </p>

      <div className="mt-6">
        <h2 className="mb-2 font-semibold text-brand-primary">Needs Review</h2>
        {table(pending, "Nothing pending.")}
      </div>

      <div className="mt-8">
        <h2 className="mb-2 font-semibold text-brand-primary">History</h2>
        {table(rest, "No past requests.")}
      </div>
    </div>
  );
}
