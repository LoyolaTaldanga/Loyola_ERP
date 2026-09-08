-- Phase 3: the auto-assignment engine ranks candidates by group match first,
-- then workload as a tiebreak (per the algorithm spec) — but the Phase 1 seed
-- had workload_tiebreak (2) ordered before group_preference (4). Since the
-- engine reads priority_order live (that's the whole point of the table),
-- fix the default ordering here; /admin/rules can still reorder it later.
--
-- New order: hard filter (pt_games_restriction) and threshold filter
-- (min_free_periods_same_subject) first — their relative order doesn't
-- change the result, filters are commutative — then the ranking pair in the
-- order the algorithm describes: group_preference before workload_tiebreak.

update public.substitution_rules set priority_order = 1 where rule_key = 'pt_games_restriction';
update public.substitution_rules set priority_order = 2 where rule_key = 'min_free_periods_same_subject';
update public.substitution_rules set priority_order = 3 where rule_key = 'group_preference';
update public.substitution_rules set priority_order = 4 where rule_key = 'workload_tiebreak';
