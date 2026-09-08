import { DAYS } from "@/lib/timetable-grid";
import type { PeriodSlot } from "@/lib/supabase/types";

export interface TimetableCellData {
  day_of_week: number;
  period_slot_id: string;
  subject_name: string | null;
  /** Teacher name on the class timetable view; class/section on a teacher's own view. */
  sub_label: string | null;
  is_practical: boolean;
}

export function TimetableTable({
  periodSlots,
  cells,
}: {
  periodSlots: PeriodSlot[];
  cells: TimetableCellData[];
}) {
  const cellMap = new Map<string, TimetableCellData>();
  for (const cell of cells) {
    cellMap.set(`${cell.day_of_week}:${cell.period_slot_id}`, cell);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-brand-primary text-white">
            <th className="sticky left-0 bg-brand-primary px-3 py-2 font-medium">Period</th>
            {DAYS.map((day) => (
              <th key={day.value} className="px-3 py-2 font-medium">
                {day.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periodSlots.map((slot) => (
            <tr key={slot.id} className="border-t border-slate-100">
              <td className="sticky left-0 bg-white px-3 py-2 align-top">
                <div className="font-medium text-slate-700">{slot.label}</div>
                <div className="text-xs text-slate-400">
                  {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                </div>
              </td>
              {DAYS.map((day) => {
                const cell = cellMap.get(`${day.value}:${slot.id}`);
                return (
                  <td key={day.value} className="px-3 py-2 align-top">
                    {cell?.subject_name ? (
                      <div>
                        <div className="font-medium text-slate-800">
                          {cell.subject_name}
                          {cell.is_practical && (
                            <span className="ml-1 text-xs font-normal text-brand-secondary">(Practical)</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{cell.sub_label ?? "—"}</div>
                      </div>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
