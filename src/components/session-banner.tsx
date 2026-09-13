import type { Session } from "@/lib/supabase/types";

/** Rendered by session-browsable admin pages when the viewed session isn't the live one. */
export function SessionBanner({ session }: { session: Session }) {
  if (session.status === "active") return null;

  if (session.status === "draft") {
    return (
      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Viewing: {session.label} (Draft) — not yet active
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-md border border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-700">
      Viewing: {session.label} (Archived, read-only)
    </div>
  );
}
