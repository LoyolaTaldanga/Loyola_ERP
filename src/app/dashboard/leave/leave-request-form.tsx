"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitLeaveRequest, type SubmitLeaveRequestState } from "./actions";

const initialState: SubmitLeaveRequestState = { error: null, success: null };

export function LeaveRequestForm({ defaultDate }: { defaultDate: string }) {
  const [state, formAction, pending] = useActionState(submitLeaveRequest, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);

  useEffect(() => {
    if (state.success) {
      setStartDate(defaultDate);
      setEndDate(defaultDate);
      formRef.current?.reset();
    }
  }, [state.success, defaultDate]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="startDate" className="text-sm font-medium text-slate-700">
            Start date
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="endDate" className="text-sm font-medium text-slate-700">
            End date
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            min={startDate}
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className="text-sm font-medium text-slate-700">
          Reason (optional)
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={2}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary-dark disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Request Leave"}
      </button>
    </form>
  );
}
