"use client";

import { useRouter } from "next/navigation";

export function SectionSelect({
  sectionId,
  options,
}: {
  sectionId: string;
  options: { id: string; label: string }[];
}) {
  const router = useRouter();

  return (
    <select
      defaultValue={sectionId}
      onChange={(e) => router.push(`/admin/timetable?section=${e.target.value}`)}
      className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
    >
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
