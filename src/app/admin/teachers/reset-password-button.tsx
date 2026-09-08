"use client";

import { useActionState, useState } from "react";
import { resetTeacherPassword, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = { error: null, password: null, teacherName: null };

export function ResetPasswordButton({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const [state, formAction, pending] = useActionState(resetTeacherPassword, initialState);
  const [confirming, setConfirming] = useState(false);

  if (state.password) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
        <p className="font-medium text-amber-900">New password for {state.teacherName}:</p>
        <p className="mt-1 font-mono">{state.password}</p>
        <p className="mt-1 text-amber-700">Relay this now — it won&apos;t be shown again.</p>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-brand-primary hover:underline"
      >
        Reset password
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="teacherId" value={teacherId} />
      <input type="hidden" name="teacherName" value={teacherName} />
      <span className="text-xs text-slate-500">Confirm reset?</span>
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
      >
        {pending ? "Resetting…" : "Yes, reset"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-slate-400 hover:underline"
      >
        Cancel
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
