-- Phase 7: academic session management. Introduces `sessions` (draft/active/
-- archived academic years) and scopes classes/sections/timetable_entries/
-- teacher_absences/substitutions/leave_requests to one.
--
-- sections/timetable_entries never need session_id set by application code —
-- it's always identical to the parent's session (class_id's / section_id's),
-- so a trigger derives it. This is what keeps the many write call-sites for
-- these two tables from all needing an explicit session_id parameter.

create type public.session_status as enum ('draft', 'active', 'archived');

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  status public.session_status not null default 'draft',
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  archived_at timestamptz,
  created_from_session_id uuid references public.sessions (id) on delete set null
);

-- At most one row can ever have status='active'.
create unique index idx_sessions_one_active on public.sessions (status) where status = 'active';

alter table public.sessions enable row level security;
create policy "sessions_select_authenticated" on public.sessions for select to authenticated using (true);
create policy "sessions_write_admin" on public.sessions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- Add session_id (nullable for now), backfill, then enforce not null ---

alter table public.classes add column session_id uuid references public.sessions (id) on delete cascade;
alter table public.sections add column session_id uuid references public.sessions (id) on delete cascade;
alter table public.timetable_entries add column session_id uuid references public.sessions (id) on delete cascade;
alter table public.teacher_absences add column session_id uuid references public.sessions (id) on delete cascade;
alter table public.substitutions add column session_id uuid references public.sessions (id) on delete cascade;
alter table public.leave_requests add column session_id uuid references public.sessions (id) on delete cascade;

insert into public.sessions (label, status, activated_at) values ('2026-27', 'active', now());

update public.classes set session_id = (select id from public.sessions where label = '2026-27') where session_id is null;
update public.sections set session_id = (select id from public.sessions where label = '2026-27') where session_id is null;
update public.timetable_entries set session_id = (select id from public.sessions where label = '2026-27') where session_id is null;
update public.teacher_absences set session_id = (select id from public.sessions where label = '2026-27') where session_id is null;
update public.substitutions set session_id = (select id from public.sessions where label = '2026-27') where session_id is null;
update public.leave_requests set session_id = (select id from public.sessions where label = '2026-27') where session_id is null;

alter table public.classes alter column session_id set not null;
alter table public.sections alter column session_id set not null;
alter table public.timetable_entries alter column session_id set not null;
alter table public.teacher_absences alter column session_id set not null;
alter table public.substitutions alter column session_id set not null;
alter table public.leave_requests alter column session_id set not null;

create index idx_classes_session_id on public.classes (session_id);
create index idx_sections_session_id on public.sections (session_id);
create index idx_timetable_entries_session_id on public.timetable_entries (session_id);
create index idx_teacher_absences_session_id on public.teacher_absences (session_id);
create index idx_substitutions_session_id on public.substitutions (session_id);
create index idx_leave_requests_session_id on public.leave_requests (session_id);

-- classes.name/stream repeat across sessions on purpose now (e.g. "XII
-- Science A" exists once per session) — the natural key gains session_id.
alter table public.classes drop constraint classes_name_stream_key;
alter table public.classes add constraint classes_session_name_stream_key unique (session_id, name, stream);

-- --- Auto-derive session_id for sections/timetable_entries ---

create or replace function public.derive_section_session_id()
returns trigger language plpgsql as $$
begin
  select session_id into new.session_id from public.classes where id = new.class_id;
  return new;
end;
$$;
create trigger trg_sections_session_id before insert or update of class_id on public.sections
  for each row execute function public.derive_section_session_id();

create or replace function public.derive_timetable_entry_session_id()
returns trigger language plpgsql as $$
begin
  select session_id into new.session_id from public.sections where id = new.section_id;
  return new;
end;
$$;
create trigger trg_timetable_entries_session_id before insert or update of section_id on public.timetable_entries
  for each row execute function public.derive_timetable_entry_session_id();

-- --- Atomic activate/revert ---
-- Never a moment with zero or two active sessions, and enforces the 2-month
-- revert window server-side (not just hidden in the UI).
create or replace function public.activate_session(target_session_id uuid)
returns void language plpgsql as $$
declare
  target record;
  current_active record;
begin
  select * into target from public.sessions where id = target_session_id for update;
  if not found then
    raise exception 'Session not found.';
  end if;
  if target.status = 'active' then
    raise exception 'This session is already active.';
  end if;
  if target.status = 'archived' and (target.archived_at is null or now() - target.archived_at >= interval '2 months') then
    raise exception 'This session''s 2-month revert window has closed — it can no longer be reactivated.';
  end if;

  select * into current_active from public.sessions where status = 'active' for update;
  if found then
    update public.sessions set status = 'archived', archived_at = now() where id = current_active.id;
  end if;

  update public.sessions
  set status = 'active', activated_at = coalesce(activated_at, now())
  where id = target_session_id;
end;
$$;
