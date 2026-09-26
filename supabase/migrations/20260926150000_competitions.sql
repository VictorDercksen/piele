-- Competitions (multi-league phase 2, docs/multi-league-architecture.md). A season plays one
-- competition from the API's registry (apps/api/app/competitions), named by a stable id.
-- Round bounds now come from that competition, so the fixed URC range (1 to 21) leaves the
-- round_number checks and the API validates the upper bound per competition. Competition
-- data shared by every league (previews, preview claims, fixture milestones) is keyed by
-- the competition as well as the fixture, because fixture ids are only unique within the
-- provider of one competition. Existing rows are all URC 2026/27.
alter table piele.seasons add column competition_id varchar(40);
update piele.seasons set competition_id = 'urc-2026-27';
alter table piele.seasons alter column competition_id set not null;

alter table piele.duties drop constraint duties_round_number_check;
alter table piele.duties add constraint duties_round_number_check check (round_number >= 1);
alter table piele.feed_entries drop constraint feed_entries_round_number_check;
alter table piele.feed_entries add constraint feed_entries_round_number_check check (round_number >= 1);
alter table piele.round_standings drop constraint round_standings_round_number_check;
alter table piele.round_standings add constraint round_standings_round_number_check check (round_number >= 1);

alter table piele.match_previews add column competition_id varchar(40) not null default 'urc-2026-27';
alter table piele.preview_dispatches add column competition_id varchar(40) not null default 'urc-2026-27';
alter table piele.fixture_milestones add column competition_id varchar(40) not null default 'urc-2026-27';

-- Revisions and retried agent runs are unique per competition and fixture.
alter table piele.match_previews drop constraint match_previews_fixture_id_revision_key;
alter table piele.match_previews
  add constraint match_previews_competition_id_fixture_id_revision_key unique (competition_id, fixture_id, revision);
drop index piele.ux_match_previews_run;
create unique index ux_match_previews_run on piele.match_previews (competition_id, fixture_id, run_id)
  where run_id is not null;

alter table piele.preview_dispatches drop constraint preview_dispatches_pkey;
alter table piele.preview_dispatches add primary key (competition_id, fixture_id, attempt);

alter table piele.fixture_milestones drop constraint fixture_milestones_pkey;
alter table piele.fixture_milestones add primary key (competition_id, fixture_id, kind);
