-- Tracks whether teachers.group was a confident derivation (or an explicit
-- Admin choice) vs. a best-effort guess from the bulk-import script that the
-- Principal should double-check. Cleared automatically the moment an Admin
-- edits the group inline on /admin/teachers.

alter table public.teachers add column group_needs_review boolean not null default false;
