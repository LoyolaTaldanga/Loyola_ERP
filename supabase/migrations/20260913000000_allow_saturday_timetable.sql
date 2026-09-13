-- The class-wise source sheet has real Saturday periods for most sections (only
-- the XI/XII stream blocks have no Saturday classes); the original importer never
-- read them and this constraint blocked storing day_of_week=6 even if it had.
-- day_of_week is already computed elsewhere via JS Date.getDay() (Sun=0..Sat=6),
-- so 6 is a value the rest of the system already produces - just widening what's
-- allowed here, no other schema changes needed.
alter table public.timetable_entries drop constraint timetable_entries_day_of_week_check;
alter table public.timetable_entries add constraint timetable_entries_day_of_week_check
  check (day_of_week between 1 and 6);
