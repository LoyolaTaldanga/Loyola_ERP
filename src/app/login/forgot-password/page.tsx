"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { message: null };

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-brand-primary">Reset your password</h1>
        <p className="mb-6 text-sm text-brand-neutral">
          This only works if you&apos;ve added and verified a personal email in your account
          settings. Teachers who haven&apos;t done that should ask the Principal to reset their
          password instead.
        </p>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Verified email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
            />
          </div>

          {state.message && <p className="text-sm text-green-700">{state.message}</p>}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary-dark disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/login" className="text-xs text-brand-primary hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
