-- ============================================================================
-- Loyola School, Taldanga — Timetable & Substitution Management System
-- Phase 1: core schema, indexes, and row level security.
--
-- Roles: only two roles exist in this system — 'admin' (Principal) and
-- 'teacher'. Admin status is carried in the Supabase auth user's
-- app_metadata as {"role": "admin"} (set via the service role when the
-- Principal's account is provisioned). Anyone without that claim who has a
-- matching row in `teachers` is treated as a teacher. There is no separate
-- `admins` table — the Principal does not need a `teachers` row.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.subject_category as enum ('academic', 'games');
create type public.teacher_group as enum ('A', 'B');
create type public.absence_status as enum ('full_day', 'partial');
create type public.assignment_method as enum ('auto', 'manual');
create type public.substitution_status as enum (
  'pending', 'assigned', 'flagged_for_review', 'confirmed', 'cancelled'
);

-- ---------------------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------------------

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- Nursery, LKG, UKG, I..XII
  stream text, -- Science / Commerce / Arts — only meaningful for XI/XII
  display_order int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_classes_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

create index idx_classes_display_order on public.classes (display_order);

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category public.subject_category not null default 'academic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_subjects_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- teachers (id = auth.users.id)
-- ---------------------------------------------------------------------------

create table public.teachers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text,
  is_active boolean not null default true,
  "group" public.teacher_group not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_teachers_updated_at
  before update on public.teachers
  for each row execute function public.set_updated_at();

create index idx_teachers_is_active on public.teachers (is_active);
create index idx_teachers_group on public.teachers ("group");

-- ---------------------------------------------------------------------------
-- sections
-- ---------------------------------------------------------------------------

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  name text not null, -- A, B, C...
  class_teacher_id uuid references public.teachers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, name)
);

create trigger trg_sections_updated_at
  before update on public.sections
  for each row execute function public.set_updated_at();

create index idx_sections_class_id on public.sections (class_id);
create index idx_sections_class_teacher_id on public.sections (class_teacher_id);

-- ---------------------------------------------------------------------------
-- teacher_subjects
-- ---------------------------------------------------------------------------

create table public.teacher_subjects (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (teacher_id, subject_id)
);

create index idx_teacher_subjects_teacher_id on public.teacher_subjects (teacher_id);
create index idx_teacher_subjects_subject_id on public.teacher_subjects (subject_id);

-- ---------------------------------------------------------------------------
-- period_slots
-- ---------------------------------------------------------------------------

create table public.period_slots (
  id uuid primary key default gen_random_uuid(),
  period_number int not null unique,
  label text not null, -- e.g. "Zero Period", "Assembly", "Period 1", "Recess"
  start_time time not null,
  end_time time not null,
  duration_minutes int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_period_slots_updated_at
  before update on public.period_slots
  for each row execute function public.set_updated_at();

create index idx_period_slots_period_number on public.period_slots (period_number);

-- ---------------------------------------------------------------------------
-- timetable_entries
-- ---------------------------------------------------------------------------

create table public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 5), -- 1=Mon .. 5=Fri
  period_slot_id uuid not null references public.period_slots (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  teacher_id uuid references public.teachers (id) on delete set null,
  is_practical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, day_of_week, period_slot_id)
);

create trigger trg_timetable_entries_updated_at
  before update on public.timetable_entries
  for each row execute function public.set_updated_at();

create index idx_timetable_entries_section_id on public.timetable_entries (section_id);
create index idx_timetable_entries_teacher_id on public.timetable_entries (teacher_id);
create index idx_timetable_entries_day_period on public.timetable_entries (day_of_week, period_slot_id);
create index idx_timetable_entries_subject_id on public.timetable_entries (subject_id);

-- ---------------------------------------------------------------------------
-- teacher_absences
-- ---------------------------------------------------------------------------

create table public.teacher_absences (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  date date not null,
  reported_at timestamptz not null default now(),
  reported_by uuid references public.teachers (id) on delete set null,
  status public.absence_status not null,
  affected_periods int[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, date)
);

create trigger trg_teacher_absences_updated_at
  before update on public.teacher_absences
  for each row execute function public.set_updated_at();

create index idx_teacher_absences_teacher_id on public.teacher_absences (teacher_id);
create index idx_teacher_absences_date on public.teacher_absences (date);

-- ---------------------------------------------------------------------------
-- substitutions
-- ---------------------------------------------------------------------------

create table public.substitutions (
  id uuid primary key default gen_random_uuid(),
  absence_id uuid not null references public.teacher_absences (id) on delete cascade,
  timetable_entry_id uuid not null references public.timetable_entries (id) on delete cascade,
  date date not null,
  substitute_teacher_id uuid references public.teachers (id) on delete set null,
  assignment_method public.assignment_method not null default 'auto',
  is_exception_fallback boolean not null default false,
  status public.substitution_status not null default 'pending',
  created_by uuid references public.teachers (id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (timetable_entry_id, date)
);

create trigger trg_substitutions_updated_at
  before update on public.substitutions
  for each row execute function public.set_updated_at();

create index idx_substitutions_absence_id on public.substitutions (absence_id);
create index idx_substitutions_timetable_entry_id on public.substitutions (timetable_entry_id);
create index idx_substitutions_date on public.substitutions (date);
create index idx_substitutions_substitute_teacher_id on public.substitutions (substitute_teacher_id);
create index idx_substitutions_status on public.substitutions (status);

-- ---------------------------------------------------------------------------
-- substitution_rules
-- ---------------------------------------------------------------------------

create table public.substitution_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  priority_order int not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_substitution_rules_updated_at
  before update on public.substitution_rules
  for each row execute function public.set_updated_at();

insert into public.substitution_rules (rule_key, priority_order, config) values
  ('min_free_periods_same_subject', 1, '{"min_free_periods": 2}'::jsonb),
  ('workload_tiebreak', 2, '{}'::jsonb),
  ('pt_games_restriction', 3, '{}'::jsonb),
  ('group_preference', 4, '{}'::jsonb);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.classes enable row level security;
alter table public.sections enable row level security;
alter table public.subjects enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_subjects enable row level security;
alter table public.period_slots enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.teacher_absences enable row level security;
alter table public.substitutions enable row level security;
alter table public.substitution_rules enable row level security;

-- classes: everyone authenticated can read; admin can write
create policy "classes_select_authenticated" on public.classes
  for select to authenticated using (true);
create policy "classes_write_admin" on public.classes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- sections: everyone authenticated can read; admin can write
create policy "sections_select_authenticated" on public.sections
  for select to authenticated using (true);
create policy "sections_write_admin" on public.sections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- subjects: everyone authenticated can read; admin can write
create policy "subjects_select_authenticated" on public.subjects
  for select to authenticated using (true);
create policy "subjects_write_admin" on public.subjects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- teachers: everyone authenticated can read the staff directory (names are
-- needed to render timetables); only admin can write.
create policy "teachers_select_authenticated" on public.teachers
  for select to authenticated using (true);
create policy "teachers_write_admin" on public.teachers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- teacher_subjects: everyone authenticated can read; admin can write
create policy "teacher_subjects_select_authenticated" on public.teacher_subjects
  for select to authenticated using (true);
create policy "teacher_subjects_write_admin" on public.teacher_subjects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- period_slots: everyone authenticated can read; admin can write
create policy "period_slots_select_authenticated" on public.period_slots
  for select to authenticated using (true);
create policy "period_slots_write_admin" on public.period_slots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- timetable_entries: everyone authenticated can read the full timetable; admin can write
create policy "timetable_entries_select_authenticated" on public.timetable_entries
  for select to authenticated using (true);
create policy "timetable_entries_write_admin" on public.timetable_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- teacher_absences: admin full access; teacher can read only their own
create policy "teacher_absences_admin_all" on public.teacher_absences
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "teacher_absences_select_own" on public.teacher_absences
  for select to authenticated using (teacher_id = auth.uid());

-- substitutions: admin full access; teacher can read rows where they are the
-- absent teacher or the assigned substitute
create policy "substitutions_admin_all" on public.substitutions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "substitutions_select_involved" on public.substitutions
  for select to authenticated using (
    substitute_teacher_id = auth.uid()
    or exists (
      select 1 from public.teacher_absences a
      where a.id = substitutions.absence_id
        and a.teacher_id = auth.uid()
    )
  );

-- substitution_rules: admin full access; teacher can read only
create policy "substitution_rules_admin_all" on public.substitution_rules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "substitution_rules_select_authenticated" on public.substitution_rules
  for select to authenticated using (true);
