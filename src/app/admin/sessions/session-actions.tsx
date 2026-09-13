"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateSession, discardSession, createNewSession, type SessionActionResult } from "./actions";

export function ActivateButton({ id }: { id: string }) {
  const router = useRouter();
  const [result, setResult] = useState<SessionActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const r = await activateSession(id);
      setResult(r);
      if (!r.error) router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="rounded bg-brand-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
      >
        {pending ? "Activating…" : "Activate"}
      </button>
      {result?.error && <p className="mt-1 max-w-xs text-xs text-red-600">{result.error}</p>}
    </div>
  );
}

export function DiscardButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [result, setResult] = useState<SessionActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Discard draft session "${label}"? This permanently deletes all of its cloned data.`)) return;
    startTransition(async () => {
      const r = await discardSession(id);
      setResult(r);
      if (!r.error) router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-60"
      >
        {pending ? "Discarding…" : "Discard"}
      </button>
      {result?.error && <p className="mt-1 max-w-xs text-xs text-red-600">{result.error}</p>}
    </div>
  );
}

export function CreateSessionForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<SessionActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await createNewSession(label);
      setResult(r);
      if (!r.error) {
        setLabel("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col text-sm">
        <span className="mb-1 font-medium text-slate-600">New session label</span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. 2027-28"
          required
          className="rounded border border-slate-300 px-2 py-1.5"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create New Session"}
      </button>
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      {result?.success && <p className="text-sm text-green-700">{result.success}</p>}
    </form>
  );
}
