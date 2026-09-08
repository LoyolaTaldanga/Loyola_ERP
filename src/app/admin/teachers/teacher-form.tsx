"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { createTeacher, type CreateTeacherState } from "./actions";

const initialState: CreateTeacherState = { error: null, credentials: null };

export function TeacherForm() {
  const [state, formAction, pending] = useActionState(createTeacher, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [dismissedCredentials, setDismissedCredentials] = useState(false);

  useEffect(() => {
    if (state.credentials) {
      formRef.current?.reset();
      setDismissedCredentials(false);
    }
  }, [state.credentials]);

  return (
    <div>
      <form
        ref={formRef}
        action={formAction}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:items-end"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-sm font-medium text-slate-700">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="group" className="text-sm font-medium text-slate-700">
            Group
          </label>
          <select
            id="group"
            name="group"
            required
            defaultValue=""
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
          >
            <option value="" disabled>
              Select
            </option>
            <option value="A">A (Nursery–V)</option>
            <option value="B">B (VI–XII)</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="h-fit rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary-dark disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create account"}
        </button>

        {state.error && <p className="col-span-full text-sm text-red-600">{state.error}</p>}
      </form>

      {state.credentials && !dismissedCredentials && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">
            Account created — save these now, the password won&apos;t be shown again:
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
            <dt className="text-amber-800">User ID:</dt>
            <dd>{state.credentials.username}</dd>
            <dt className="text-amber-800">Password:</dt>
            <dd>{state.credentials.password}</dd>
          </dl>
          <button
            onClick={() => setDismissedCredentials(true)}
            className="mt-3 rounded-md border border-amber-400 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            I&apos;ve saved this
          </button>
        </div>
      )}
    </div>
  );
}
