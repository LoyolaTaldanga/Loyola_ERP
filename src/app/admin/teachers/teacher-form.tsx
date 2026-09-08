"use client";

import { useActionState, useRef, useEffect } from "react";
import { createTeacher, type CreateTeacherState } from "./actions";

const initialState: CreateTeacherState = { error: null, success: null };

export function TeacherForm() {
  const [state, formAction, pending] = useActionState(createTeacher, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 sm:items-end">
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
        <label htmlFor="email" className="text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
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
        {pending ? "Creating…" : "Create & invite"}
      </button>

      {state.error && <p className="col-span-full text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="col-span-full text-sm text-green-700">{state.success}</p>}
    </form>
  );
}
