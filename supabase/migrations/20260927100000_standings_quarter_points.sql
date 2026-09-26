-- Superbru pool results carry quarter points (5.75, 4.25). Round points were stored to one
-- decimal place; store two, keeping the same range.
alter table piele.round_standings alter column points type numeric(7, 2);
