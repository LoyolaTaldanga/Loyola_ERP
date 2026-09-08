-- classes.name was uniquely constrained on its own, but XI and XII each have
-- three stream rows sharing the same name (e.g. "XII"/Science, "XII"/Commerce,
-- "XII"/Arts) discovered while building the Excel importer. Uniqueness needs
-- to be on (name, stream) instead.

alter table public.classes drop constraint classes_name_key;
alter table public.classes add constraint classes_name_stream_key unique (name, stream);
