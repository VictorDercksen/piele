-- Evidence cases. Every evidence link a member submits opens a case: the league's other
-- active members accept it, or veto it with a reason, for 24 hours. A majority of accepts
-- accepts the evidence at once, a veto sends the case to a reviewer, and a case that closes
-- with neither is accepted automatically. There is no scheduler: the API settles cases past
-- closes_at lazily inside the next request's transaction, with resolved_at = closes_at.
--
-- The electorate is frozen when the case opens: one voter row per eligible member (active
-- in the league with a claimed name, not the duty's member, not the submitter). A name
-- claimed later does not join; the API removes a released name's uncast ballot from live
-- cases and lowers eligible_count. Voter rows are ballots; the API never returns whose
-- they are.

-- The member who reviews vetoes when the captain is involved (the captain's own duty, or
-- the captain's veto). Never the captain; the API clears it when the member is withdrawn,
-- released or appointed captain.
alter table piele.leagues add column stand_in_reviewer_membership_id uuid;
alter table piele.leagues
  add constraint fk_leagues_stand_in_reviewer
  foreign key (stand_in_reviewer_membership_id, id) references piele.league_memberships (id, league_id);
alter table piele.leagues
  add constraint leagues_stand_in_not_captain
  check (stand_in_reviewer_membership_id is null or stand_in_reviewer_membership_id <> captain_membership_id);

alter table piele.duty_evidence_links add constraint duty_evidence_links_id_league_id_key unique (id, league_id);

-- status: open (voting), in_review (a veto awaits a reviewer), accepted, rejected, or
-- superseded (newer evidence, a voided duty, or other evidence completed the duty).
-- resolution says how an accepted or rejected case closed: majority, auto (closed without a
-- veto or a majority), no_voters (nobody could vote), veto_upheld, or captain (the captain's
-- override on the evidence itself).
create table piele.evidence_cases (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  season_id uuid not null,
  duty_id uuid not null,
  link_id uuid not null unique,
  subject_membership_id uuid not null,
  opened_at timestamptz not null default now(),
  closes_at timestamptz not null,
  eligible_count integer not null check (eligible_count >= 0),
  status varchar(20) not null default 'open'
    check (status in ('open', 'in_review', 'accepted', 'rejected', 'superseded')),
  resolution varchar(20)
    check (resolution in ('majority', 'auto', 'no_voters', 'veto_upheld', 'captain')),
  resolved_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (season_id, league_id) references piele.seasons (id, league_id),
  foreign key (duty_id, league_id) references piele.duties (id, league_id),
  foreign key (link_id, league_id) references piele.duty_evidence_links (id, league_id),
  foreign key (subject_membership_id, league_id) references piele.league_memberships (id, league_id),
  unique (id, league_id),
  check (closes_at > opened_at),
  check ((status in ('open', 'in_review')) = (resolved_at is null)),
  check ((status in ('accepted', 'rejected')) = (resolution is not null)),
  check (status <> 'accepted' or resolution in ('majority', 'auto', 'no_voters', 'captain')),
  check (status <> 'rejected' or resolution in ('veto_upheld', 'captain'))
);

create unique index ux_evidence_cases_one_live_per_duty on piele.evidence_cases (duty_id)
  where status in ('open', 'in_review');
create index ix_evidence_cases_due on piele.evidence_cases (league_id, closes_at) where status = 'open';
create index ix_evidence_cases_season on piele.evidence_cases (season_id, opened_at);

alter table piele.evidence_cases enable row level security;
create policy evidence_cases_current on piele.evidence_cases for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());

-- choice: null (no response), accept, or veto (with veto_reason). An accept may become a
-- veto while voting is open; a veto is final. A veto is reviewed once: review_status goes
-- from pending to upheld or dismissed, with the reviewer's reason. reviewed_by_label
-- attributes the admin reviewing without a membership, as the audit trail does.
-- responded_by_user_id is the account that responded: a ballot is shown to and changed by
-- that account only, so a name whose claim is released passes no ballot to the next claimant.
create table piele.evidence_case_voters (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references piele.leagues (id),
  case_id uuid not null,
  membership_id uuid not null,
  choice varchar(10) check (choice in ('accept', 'veto')),
  veto_reason varchar(500),
  responded_at timestamptz,
  responded_by_user_id uuid references piele.users (id),
  review_status varchar(20) check (review_status in ('pending', 'upheld', 'dismissed')),
  reviewed_by_membership_id uuid,
  reviewed_by_label varchar(80),
  reviewed_at timestamptz,
  review_reason varchar(500),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (case_id, league_id) references piele.evidence_cases (id, league_id),
  foreign key (membership_id, league_id) references piele.league_memberships (id, league_id),
  foreign key (reviewed_by_membership_id, league_id) references piele.league_memberships (id, league_id),
  unique (case_id, membership_id),
  check ((choice is null) = (responded_at is null)),
  check ((choice is null) = (responded_by_user_id is null)),
  check ((choice = 'veto') = (veto_reason is not null)),
  check ((choice = 'veto') = (review_status is not null)),
  check ((review_status in ('upheld', 'dismissed')) = (reviewed_at is not null)),
  check (reviewed_at is null or (reviewed_by_label is not null and review_reason is not null))
);

create index ix_evidence_case_voters_member on piele.evidence_case_voters (membership_id);

alter table piele.evidence_case_voters enable row level security;
create policy evidence_case_voters_current on piele.evidence_case_voters for all to piele_api
  using (league_id = piele.current_league_id()) with check (league_id = piele.current_league_id());

-- Backfill: evidence waiting for the captain when this migration runs. The newest pending
-- evidence of each live duty gets a case opened now, with the electorate of today; older
-- pending evidence stays pending without a case (the captain's override still decides it,
-- and a new submission supersedes it). A case nobody can vote on is accepted at once, which
-- completes the duty from the evidence's effective time and supersedes its other pending
-- evidence. The statements skip evidence that already has a case, so they can run again
-- (tests/test_cases.py does).
with pending as (
  select distinct on (l.duty_id)
    l.id as link_id, l.league_id, l.duty_id, d.season_id, s.subject_membership_id, s.submitter_membership_id
  from piele.duty_evidence_links l
  join piele.duties d on d.id = l.duty_id
  join piele.evidence_submissions s on s.id = l.submission_id
  where l.decision = 'pending' and d.status in ('open', 'pending_deadline')
    and not exists (select 1 from piele.evidence_cases c where c.link_id = l.id)
    and not exists (select 1 from piele.evidence_cases c where c.duty_id = l.duty_id and c.status in ('open', 'in_review'))
  order by l.duty_id, s.submitted_at desc, l.id desc
),
opened as (
  insert into piele.evidence_cases (league_id, season_id, duty_id, link_id, subject_membership_id, closes_at, eligible_count)
  select p.league_id, p.season_id, p.duty_id, p.link_id, p.subject_membership_id, now() + interval '24 hours',
    (select count(*) from piele.league_memberships m
     where m.league_id = p.league_id and m.status = 'active' and m.user_id is not null
       and m.id not in (p.subject_membership_id, p.submitter_membership_id))
  from pending p
  returning id, league_id, link_id
)
insert into piele.evidence_case_voters (league_id, case_id, membership_id)
select o.league_id, o.id, m.id
from opened o
join pending p on p.link_id = o.link_id
join piele.league_memberships m
  on m.league_id = o.league_id and m.status = 'active' and m.user_id is not null
  and m.id not in (p.subject_membership_id, p.submitter_membership_id);

-- The API accepts a case without voters as it opens, so only backfilled ones match here.
with accepted as (
  update piele.evidence_cases c
  set status = 'accepted', resolution = 'no_voters', resolved_at = c.opened_at, updated_at = now(), version = c.version + 1
  where c.status = 'open' and c.eligible_count = 0
  returning c.link_id, c.opened_at
),
decided as (
  update piele.duty_evidence_links l
  set decision = 'accepted', decided_at = a.opened_at, reason = 'No other member could vote.',
    effective_completed_at = case when s.submitter_membership_id <> s.subject_membership_id
      then s.claimed_completed_at else s.submitted_at end,
    updated_at = now(), version = l.version + 1
  from accepted a, piele.evidence_submissions s
  where l.id = a.link_id and s.id = l.submission_id
  returning l.duty_id, l.effective_completed_at
)
update piele.duties d
set status = 'completed', completed_at = x.effective_completed_at, updated_at = now(), version = d.version + 1
from decided x
where d.id = x.duty_id;

update piele.duty_evidence_links l
set decision = 'superseded', updated_at = now(), version = l.version + 1
from piele.duties d
where d.id = l.duty_id and l.decision = 'pending' and d.status = 'completed';
