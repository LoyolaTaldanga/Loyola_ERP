"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setViewingSession } from "@/app/admin/sessions/actions";
import type { Session } from "@/lib/supabase/types";

const STATUS_LABEL: Record<Session["status"], string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

export function SessionSwitcher({ sessions, viewingId }: { sessions: Session[]; viewingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(id: string) {
    startTransition(async () => {
      await setViewingSession(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md bg-white/10 p-3">
      <p className="text-xs font-medium text-white/70">Viewing session</p>
      <select
        value={viewingId}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        className="mt-1 w-full rounded border-none bg-white/90 px-2 py-1 text-xs text-slate-800"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label} ({STATUS_LABEL[s.status]})
          </option>
        ))}
      </select>
    </div>
  );
}
