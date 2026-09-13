-- Phase 8: annual leave quota tracking (casual/paid). Leave-year is a plain
-- calendar year computed from teacher_absences.date — deliberately NOT
-- related to Phase 7's sessions in any way (a session and a leave-year are
-- independent concepts).

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values ('default_annual_leave_quota', '30'::jsonb);

alter table public.app_settings enable row level security;
create policy "app_settings_select_authenticated" on public.app_settings for select to authenticated using (true);
create policy "app_settings_write_admin" on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- null = use the global default; set = overrides it for this teacher only.
alter table public.teachers add column leave_quota_override int;

-- Only meaningful for status='full_day' rows — partial-day absences never
-- consume annual leave in this phase, so this stays null on those.
create type public.leave_type as enum ('casual', 'paid');
alter table public.teacher_absences add column leave_type public.leave_type;
