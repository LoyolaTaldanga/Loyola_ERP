"use client";

import { useActionState } from "react";
import { requestEmailVerification, type UpdateEmailState } from "./actions";

const initialState: UpdateEmailState = { error: null, message: null };

export function EmailForm({ currentRealEmail, verified }: { currentRealEmail: string | null; verified: boolean }) {
  const [state, formAction, pending] = useActionState(requestEmailVerification, initialState);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-brand-primary">Personal email</h2>
      <p className="mt-1 text-sm text-slate-500">
        Add and verify a personal email to unlock self-service &quot;forgot password&quot; — without
        it, only the Principal can reset your password.
      </p>

      {currentRealEmail && (
        <p className="mt-3 text-sm">
          Current: <span className="font-medium">{currentRealEmail}</span>{" "}
          <span className={verified ? "text-green-700" : "text-amber-600"}>
            {verified ? "(verified)" : "(pending verification — check your inbox)"}
          </span>
        </p>
      )}

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            {currentRealEmail ? "Change email" : "Add email"}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary-dark disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send verification link"}
        </button>
      </form>

      {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="mt-3 text-sm text-green-700">{state.message}</p>}
    </div>
  );
}
