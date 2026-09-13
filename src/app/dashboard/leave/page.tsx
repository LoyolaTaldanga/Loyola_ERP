import { getCurrentUser } from "@/lib/auth/get-role";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/today";
import { getActiveSession } from "@/lib/session-context";
import { LeaveRequestForm } from "./leave-request-form";
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

export default async function LeaveRequestsPage() {
  const current = await getCurrentUser();
  const supabase = await createClient();
  // Teachers only ever see/act against the active session, never a
  // draft/archived one — they shouldn't request or view leave against an
  // unapproved future timetable or a superseded past one.
  const activeSession = await getActiveSession(supabase);

  const { data: requests } = await supabase
    .from("leave_requests")
    .select("id, start_date, end_date, status, reason, requested_at")
    .eq("teacher_id", current!.user.id)
    .eq("session_id", activeSession.id)
    .order("requested_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Request Leave</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Submit a leave request for admin approval. Nothing changes on the timetable until it&apos;s
        approved.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <LeaveRequestForm defaultDate={todayISO()} />
      </div>

      <div className="mt-8">
        <h2 className="mb-2 font-semibold text-brand-primary">Your Requests</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Dates</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Slip</th>
              </tr>
            </thead>
            <tbody>
              {(requests ?? []).map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`}
                  </td>
                  <td className="px-3 py-2">{r.reason ?? ""}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status as LeaveRequestStatus]}`}
                    >
                      {STATUS_LABEL[r.status as LeaveRequestStatus]}
                    </span>
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
              {(requests ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    No leave requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
