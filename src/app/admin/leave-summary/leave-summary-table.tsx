"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface LeaveSummaryRow {
  id: string;
  name: string;
  quota: number;
  casualTaken: number;
  casualLeft: number;
  totalPaid: number;
}

type SortKey = keyof Omit<LeaveSummaryRow, "id">;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Teacher" },
  { key: "quota", label: "Total Quota" },
  { key: "casualTaken", label: "Taken (Casual)" },
  { key: "casualLeft", label: "Left (Casual)" },
  { key: "totalPaid", label: "Total Paid" },
];

export function LeaveSummaryTable({ rows }: { rows: LeaveSummaryRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [ascending, setAscending] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return ascending ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, ascending]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setAscending((a) => !a);
    } else {
      setSortKey(key);
      setAscending(true);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort(col.key)}
                  className="flex items-center gap-1 hover:text-slate-700"
                >
                  {col.label}
                  {sortKey === col.key && <span>{ascending ? "▲" : "▼"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-4 py-3">
                <Link href={`/admin/teachers/${r.id}`} className="text-brand-primary hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="px-4 py-3">{r.quota}</td>
              <td className="px-4 py-3">{r.casualTaken}</td>
              <td className="px-4 py-3">{r.casualLeft}</td>
              <td className="px-4 py-3">{r.totalPaid}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                No teachers yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
