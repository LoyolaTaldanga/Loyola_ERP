-- Phase 2: teachers log in with a username + password instead of a school
-- email (they don't have official ones). `teachers.email` keeps meaning
-- "the email currently attached to this teacher's Supabase Auth user" — a
-- synthetic `<username>@loyolataldanga.internal` address until the teacher
-- adds and verifies a real personal email, at which point it's swapped to
-- that (see /auth/confirm's `email_change` handling).
--
-- teachers table is still empty at this point (Phase 1 deferred teacher
-- account creation), so these columns can be added NOT NULL directly.

alter table public.teachers add column username text not null unique;
alter table public.teachers add column real_email text unique;
alter table public.teachers add column real_email_verified boolean not null default false;
