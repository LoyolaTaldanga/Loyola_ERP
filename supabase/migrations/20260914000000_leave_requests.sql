-- Phase 5: teacher self-service leave requests with admin approval.
-- A pending request has no teacher_absences/substitutions rows at all —
-- those are only created at approval time (see src/lib/create-absence.ts),
-- which keeps rejecting a pending request free (nothing to unwind) and
-- means the substitution engine never runs on unapproved leave.

create type public.leave_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status public.leave_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  reason text,
  reviewed_by uuid references public.teachers (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create trigger trg_leave_requests_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

create index idx_leave_requests_teacher_id on public.leave_requests (teacher_id);
create index idx_leave_requests_status on public.leave_requests (status);

-- Traces each generated absence back to the request that created it, so slip
-- generation can pull every date/period under one request as one document.
-- ON DELETE SET NULL (not CASCADE): cancelling a leave request deletes its
-- teacher_absences rows explicitly in application code; this FK only matters
-- if a leave_requests row is ever hard-deleted directly, in which case the
-- historical absence record should survive with the link merely cleared.
alter table public.teacher_absences add column leave_request_id uuid
  references public.leave_requests (id) on delete set null;
create index idx_teacher_absences_leave_request_id on public.teacher_absences (leave_request_id);

alter table public.leave_requests enable row level security;

-- leave_requests: admin full access; teacher can read their own and insert
-- their own (only ever as 'pending' — approval/rejection/cancellation is
-- admin-only via the service-role client, never a direct teacher update).
create policy "leave_requests_admin_all" on public.leave_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "leave_requests_select_own" on public.leave_requests
  for select to authenticated using (teacher_id = auth.uid());
create policy "leave_requests_insert_own" on public.leave_requests
  for insert to authenticated with check (teacher_id = auth.uid() and status = 'pending');
