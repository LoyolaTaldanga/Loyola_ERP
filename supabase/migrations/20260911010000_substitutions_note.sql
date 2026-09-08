-- Phase 3: the auto-assignment engine needs somewhere to record why a
-- substitution was left pending (e.g. "No candidate available") instead of
-- silently failing, per the spec.

alter table public.substitutions add column note text;
