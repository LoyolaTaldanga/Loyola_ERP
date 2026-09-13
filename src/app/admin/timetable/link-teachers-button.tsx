"use client";

import { useState, useTransition } from "react";
import { linkTeachersByName } from "./actions";
import type { LinkTeachersResult } from "../../../../scripts/import-lib/link-teachers";

export function LinkTeachersButton({ sessionId }: { sessionId: string }) {
  const [result, setResult] = useState<LinkTeachersResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const r = await linkTeachersByName(sessionId);
      setResult(r);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary-dark disabled:opacity-60"
      >
        {pending ? "Linking…" : "Link Teachers by Name"}
      </button>

      {result && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          {result.error ? (
            <p className="text-red-600">{result.error}</p>
          ) : (
            <>
              <p>
                Linked <strong>{result.linked}</strong> cell(s). {result.alreadySet} already had a teacher and
                were left untouched.
              </p>
              {result.nameNotFound.length > 0 && (
                <p className="mt-1 text-amber-700">
                  No teacher account found for: {result.nameNotFound.join(", ")}
                </p>
              )}
              {result.unresolvedSection > 0 && (
                <p className="mt-1 text-slate-500">
                  {result.unresolvedSection} slot(s) referenced a section that couldn&apos;t be resolved
                  (see the Review page).
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
