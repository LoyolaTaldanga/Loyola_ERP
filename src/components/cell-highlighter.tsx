"use client";

import { useEffect } from "react";

/**
 * Scrolls a specific timetable grid cell into view and briefly flashes it —
 * used when arriving via a "Go to class timetable" jump link from a
 * teacher's profile page, so Admin doesn't have to hunt for the cell.
 */
export function CellHighlighter({ dayOfWeek, periodSlotId }: { dayOfWeek: number; periodSlotId: string }) {
  useEffect(() => {
    const el = document.getElementById(`cell-${dayOfWeek}-${periodSlotId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-brand-secondary", "bg-amber-50");
    const timeout = setTimeout(() => {
      el.classList.remove("ring-2", "ring-brand-secondary", "bg-amber-50");
    }, 2500);
    return () => clearTimeout(timeout);
  }, [dayOfWeek, periodSlotId]);

  return null;
}
