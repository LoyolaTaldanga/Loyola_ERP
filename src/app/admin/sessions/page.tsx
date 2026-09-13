import { createClient } from "@/lib/supabase/server";
import type { Session } from "@/lib/supabase/types";
import { ActivateButton, DiscardButton, CreateSessionForm } from "./session-actions";

const REVERT_WINDOW_MONTHS = 2;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function revertDeadline(archivedAt: string): Date {
  const d = new Date(archivedAt);
  d.setMonth(d.getMonth() + REVERT_WINDOW_MONTHS);
  return d;
}

const STATUS_CLASS: Record<Session["status"], string> = {
  draft: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-700",
  archived: "bg-slate-100 text-slate-600",
};

export default async function SessionsPage() {
  const supabase = await createClient();
  const { data: sessions } = await supabase.from("sessions").select("*").order("created_at", { ascending: false });

  const now = new Date();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Sessions</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Prepare next year&apos;s timetable as a draft while this year&apos;s stays live, then activate it.
        An activated-over session can be reverted for 2 months before it becomes permanently
        read-only.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <CreateSessionForm />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Label</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Activated</th>
              <th className="px-3 py-2 font-medium">Archived</th>
              <th className="px-3 py-2 font-medium">Revert window</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(sessions ?? []).map((s) => {
              const deadline = s.status === "archived" && s.archived_at ? revertDeadline(s.archived_at) : null;
              const withinWindow = deadline ? now < deadline : false;
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{s.label}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[s.status]}`}>
                      {s.status[0].toUpperCase() + s.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{formatDate(s.created_at)}</td>
                  <td className="px-3 py-2">{formatDate(s.activated_at)}</td>
                  <td className="px-3 py-2">{formatDate(s.archived_at)}</td>
                  <td className="px-3 py-2">
                    {s.status === "archived" &&
                      (withinWindow ? (
                        <span className="text-amber-700">Revert available until {formatDate(deadline!.toISOString())}</span>
                      ) : (
                        <span className="text-slate-400">Read-only (revert window closed)</span>
                      ))}
                  </td>
                  <td className="px-3 py-2">
                    {s.status === "draft" && (
                      <div className="flex gap-2">
                        <ActivateButton id={s.id} />
                        <DiscardButton id={s.id} label={s.label} />
                      </div>
                    )}
                    {s.status === "archived" && withinWindow && <ActivateButton id={s.id} />}
                  </td>
                </tr>
              );
            })}
            {(sessions ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No sessions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
