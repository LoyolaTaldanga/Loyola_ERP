// Loyola School, Taldanga — official bell timing (Normal schedule).
// period_number is a sort/reference key, not necessarily contiguous:
// 0-8 match the real instructional periods (as used in both timetable
// Excel files); Assembly/Recess/Dispersal get out-of-band values so they
// sort correctly without colliding with real period numbers.
export const PERIOD_SLOTS = [
  { period_number: -1, label: "Assembly", start_time: "07:22", end_time: "07:40", duration_minutes: 18 },
  { period_number: 0, label: "Zero Period", start_time: "07:40", end_time: "08:15", duration_minutes: 35 },
  { period_number: 1, label: "Period 1", start_time: "08:15", end_time: "08:55", duration_minutes: 40 },
  { period_number: 2, label: "Period 2", start_time: "08:55", end_time: "09:30", duration_minutes: 35 },
  { period_number: 3, label: "Period 3", start_time: "09:30", end_time: "10:05", duration_minutes: 35 },
  { period_number: 100, label: "Recess", start_time: "10:05", end_time: "10:30", duration_minutes: 25 },
  { period_number: 4, label: "Period 4", start_time: "10:30", end_time: "11:05", duration_minutes: 35 },
  { period_number: 5, label: "Period 5", start_time: "11:05", end_time: "11:40", duration_minutes: 35 },
  { period_number: 6, label: "Period 6", start_time: "11:40", end_time: "12:15", duration_minutes: 35 },
  { period_number: 7, label: "Period 7", start_time: "12:15", end_time: "12:50", duration_minutes: 35 },
  { period_number: 8, label: "Period 8", start_time: "12:50", end_time: "13:25", duration_minutes: 35 },
  { period_number: 101, label: "Dispersal", start_time: "13:30", end_time: "13:30", duration_minutes: 0 },
] as const;

// Maps the Excel sheets' column period-numbers (0-8, as printed in their
// "DAY" header rows) to our period_slots.period_number — currently 1:1,
// kept as an explicit table in case the sheets ever use a different scheme.
export const EXCEL_PERIOD_TO_SLOT: Record<number, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
};
