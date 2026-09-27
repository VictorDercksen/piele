import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { CompetitionService } from '../competition/competition.service';
import { isAccentColour, isEmblemPreset } from './emblems';
import { ApiError } from './http-league-data';
import { LeagueData } from './league-data';
import {
  Account,
  AppearanceChange,
  Duty,
  DutyEvidence,
  EvidenceSubmission,
  FeedItem,
  FixturePicks,
  JoinPreview,
  LeagueAppearance,
  LeagueMember,
  LeagueRules,
  LeagueSummary,
  MemberMarks,
  MemberPick,
  NewDuty,
  NewMember,
  NewPick,
  NotificationsRead,
  Poll,
  RoundNote,
  RoundStanding,
  StandingEntry,
  StewardPick,
} from './league.models';
import { loadStoredRead, storeRead } from './notifications-read';
import { sampleMarks } from './marks';
import {
  SAMPLE_ACCOUNT,
  SAMPLE_LEAGUES,
  SAMPLE_ME as ME,
  SampleDutyRecord as DutyRecord,
  SampleLeagueSeed,
  SamplePickRecord,
  feedItem,
  memberRecord,
  sampleResults,
} from './sample-leagues';
import { rankRows, withDefaultRules } from './superbru';

function title(
  type: Duty['type'],
  roundId: number | null,
  roundCode: (id: number) => string,
): string {
  const label = type === 'spoon' ? 'Spoon duty' : 'Pick confirmation';
  if (roundId === null) return label;
  return `Round ${roundCode(roundId)} ${label}`;
}

/**
 * The sample leagues for local development, one set of in-memory records per league.
 * `selectLeague` switches every signal to that league's records; changes live until reload.
 * Names, points, duties and votes are samples, never published competition results.
 */
@Injectable()
export class SampleLeagueData extends LeagueData {
  private readonly competition = inject(CompetitionService);
  private readonly leagues = new Map<string, SampleLeague>();
  /** Every sample league, including those made in the management centre this session. */
  private readonly seeds = signal<readonly SampleLeagueSeed[]>(SAMPLE_LEAGUES);
  private readonly active = signal<SampleLeague>(this.league(SAMPLE_LEAGUES[0]));
  readonly source = 'sample';
  /**
   * Whether the sample account is the admin. Read once from the first page's address:
   * `?sampleAdmin=0` makes it a plain member of Piele and the Pofadder Bowl.
   */
  readonly isAdmin = sampleAdmin();
  /** The slug of the league whose records are showing. */
  readonly slug = computed(() => this.active().seed.summary.slug);
  /** The sample member, or null in the league the sample account sees only as the admin. */
  readonly currentMemberId = computed(() => this.active().memberId);
  readonly currentMemberName = signal<string | null>(null).asReadonly();
  readonly captainMemberId = computed(() => this.active().captain());
  /** The sample account is the admin, so it stewards every sample league. */
  readonly administers = computed(
    () => this.isAdmin || this.active().captain() === this.currentMemberId(),
  );
  readonly joinCode = computed(() => (this.administers() ? this.active().joinCode() : null));
  readonly withdrawnMembers = this.from((league) => league.withdrawn);
  /** The showing league's emblem and accent colour, including changes made this session. */
  readonly appearance = this.from((league) => league.appearance);
  readonly loading = signal(false).asReadonly();
  readonly error = signal<string | null>(null).asReadonly();
  readonly members = this.from((league) => league.members);
  readonly standings = this.from((league) => league.standings);
  readonly picks = this.from((league) => league.picks);
  readonly rules = this.from((league) => league.rules);
  readonly duties = this.from((league) => league.duties);
  readonly marks = this.from((league) => league.marks);
  readonly polls = this.from((league) => league.polls);
  readonly notes = this.from((league) => league.notes);
  readonly feed = this.from((league) => league.feed);
  readonly notificationsRead = this.from((league) => league.read);

  /** Switches to a sample league's records. Unknown slugs keep the current league. */
  selectLeague(league: LeagueSummary): void {
    const seed = this.seed(league.slug);
    if (seed) this.active.set(this.league(seed));
  }

  /** The sample league with this slug, whether or not it is showing. */
  seed(slug: string): SampleLeagueSeed | undefined {
    return this.seeds().find((s) => s.summary.slug === slug);
  }

  /** Every sample league's records, archived ones included, for the management centre. */
  sampleLeagues(): readonly SampleLeague[] {
    return this.seeds().map((seed) => this.league(seed));
  }

  /** Adds a league made in the management centre; it lives until reload. */
  addLeague(seed: SampleLeagueSeed): SampleLeague {
    this.seeds.update((seeds) => [...seeds, seed]);
    return this.league(seed);
  }

  /**
   * The sample account document, as `GET /v1/me` would answer now: active leagues only, by
   * name; the admin also lists the leagues it holds no membership in.
   */
  account(): Account {
    return {
      ...SAMPLE_ACCOUNT,
      isAdmin: this.isAdmin,
      leagues: this.sampleLeagues()
        .filter((league) => league.status() === 'active' && (this.isAdmin || !!league.memberId))
        .map((league) => league.summary())
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  reload(): void {
    this.active().reload();
  }

  refreshFeed(): Promise<void> {
    return Promise.resolve();
  }

  saveNotificationsRead(read: NotificationsRead): Promise<void> {
    return this.active().saveNotificationsRead(read);
  }

  submitEvidence(submission: EvidenceSubmission): Promise<void> {
    return this.active().submitEvidence(submission);
  }

  createDuty(duty: NewDuty): Promise<void> {
    return this.active().createDuty(duty);
  }

  voidDuty(dutyId: string, reason: string): Promise<void> {
    return this.active().voidDuty(dutyId, reason);
  }

  resetClock(dutyId: string, reason: string): Promise<void> {
    return this.active().resetClock(dutyId, reason);
  }

  decideEvidence(linkId: string, decision: 'accepted' | 'rejected', reason: string): Promise<void> {
    return this.active().decideEvidence(linkId, decision, reason);
  }

  playbackUrl(): Promise<string> {
    return Promise.reject(new Error('Sample evidence has no video.'));
  }

  addMember(member: NewMember): Promise<void> {
    return this.active().addMember(member);
  }

  releaseMember(memberId: string): Promise<void> {
    return this.active().releaseMember(memberId);
  }

  updateMember(memberId: string, email: string | null): Promise<void> {
    return this.active().updateMember(memberId, email);
  }

  castVote(pollId: string, choice: string): Promise<void> {
    return this.active().castVote(pollId, choice);
  }

  withdrawMember(memberId: string, reason: string): Promise<void> {
    return this.active().withdrawMember(memberId, reason);
  }

  reinstateMember(memberId: string): Promise<void> {
    return this.active().reinstateMember(memberId);
  }

  rotateJoinCode(): Promise<string> {
    return this.active().rotateJoinCode();
  }

  closeJoinCode(): Promise<void> {
    return this.active().closeJoinCode();
  }

  saveAppearance(change: AppearanceChange): Promise<LeagueAppearance> {
    return this.active().saveAppearance(change);
  }

  savePick(fixtureId: string, pick: NewPick): Promise<void> {
    return this.active().savePick(fixtureId, pick);
  }

  recordPicks(fixtureId: string, picks: readonly StewardPick[]): Promise<void> {
    return this.steward() ?? this.active().recordPicks(fixtureId, picks);
  }

  removePick(fixtureId: string, memberId: string): Promise<void> {
    return this.steward() ?? this.active().removePick(fixtureId, memberId);
  }

  saveRules(change: Partial<LeagueRules>): Promise<void> {
    return this.steward() ?? this.active().saveRules(change);
  }

  recordStandings(roundId: number, entries: readonly StandingEntry[]): Promise<void> {
    return this.steward() ?? this.active().recordStandings(roundId, entries);
  }

  clearStanding(roundId: number, memberId: string): Promise<void> {
    return this.steward() ?? this.active().clearStanding(roundId, memberId);
  }

  /** The API's refusal of a steward route for anyone but the captain or admin, else null. */
  private steward(): Promise<void> | null {
    return this.administers() ? null : refuse(403, 'captain_only', 'Only the captain can do this.');
  }

  /**
   * What `/join/{code}` shows for a sample league's current join code (codes rotate and
   * close in memory). Rejects like the API for an unknown or closed code.
   */
  preview(code: string): JoinPreview {
    const league = this.sampleLeagues().find(
      (l) => l.status() === 'active' && l.joinCode() === code,
    );
    if (!league)
      throw new ApiError(
        404,
        'unknown_join_code',
        'That join link is not valid. Ask the captain for a new one.',
      );
    const { id, slug, name, timezone, competition, seasonName } = league.summary();
    return {
      league: { id, slug, name, timezone, competition, seasonName, ...league.appearance() },
      alreadyMember: !!league.memberId,
      unclaimed: league
        .members()
        .filter((member) => !member.claimed)
        .map((member) => ({ id: member.id, displayName: member.name })),
    };
  }

  private league(seed: SampleLeagueSeed): SampleLeague {
    let league = this.leagues.get(seed.summary.slug);
    if (!league) {
      league = new SampleLeague(seed, this.competition);
      this.leagues.set(seed.summary.slug, league);
    }
    return league;
  }

  /** A signal that follows the active league's records. */
  private from<T>(pick: (league: SampleLeague) => Signal<T>): Signal<T> {
    return computed(() => pick(this.active())());
  }
}

/** One sample league's in-memory records and the rules the API would apply to them. */
export class SampleLeague {
  readonly seed: SampleLeagueSeed;
  private readonly me: WritableSignal<string | null>;
  private readonly meInSeason = signal(true);
  private readonly captainState: WritableSignal<string>;
  /** The captain's membership. */
  readonly captain: Signal<string>;
  private readonly nameState: WritableSignal<string>;
  private readonly zoneState: WritableSignal<string>;
  private readonly statusState = signal<'active' | 'archived'>('active');
  readonly name: Signal<string>;
  readonly timezone: Signal<string>;
  /** Archived leagues keep their records but leave every list but the management centre's. */
  readonly status = this.statusState.asReadonly();
  private readonly competition: CompetitionService;
  private readonly memberRecords: WritableSignal<readonly LeagueMember[]>;
  /** Active members; withdrawn ones move to `withdrawn` and drop out of every list. */
  readonly members: Signal<readonly LeagueMember[]>;
  private readonly withdrawnRecords = signal<readonly LeagueMember[]>([]);
  readonly withdrawn = this.withdrawnRecords.asReadonly();
  private readonly standingRecords: WritableSignal<readonly RoundStanding[]>;
  /** Recorded round totals of active members: overrides of the derived totals. */
  readonly standings = computed(() => {
    const active = new Set(this.memberRecords().map((m) => m.id));
    return this.standingRecords().filter((s) => active.has(s.memberId));
  });
  private readonly pickRecords: WritableSignal<readonly SamplePickRecord[]>;
  private readonly rulesState: WritableSignal<LeagueRules>;
  readonly rules: Signal<LeagueRules>;
  private readonly dutyRecords: WritableSignal<readonly DutyRecord[]>;
  private readonly code: WritableSignal<string | null>;
  readonly joinCode: Signal<string | null>;
  private readonly look: WritableSignal<LeagueAppearance>;
  readonly appearance: Signal<LeagueAppearance>;
  private readonly clock = signal(Date.now());
  readonly duties = computed<readonly Duty[]>(() => {
    const now = new Date(this.clock());
    const members = this.memberRecords();
    const active = new Set(members.map((m) => m.id));
    const picks = this.pickRecords();
    return this.dutyRecords().filter((record) => active.has(record.memberId)).map((record) => {
      const marks = sampleMarks(
        record.deadlineAt,
        record.completedAt,
        record.status === 'voided',
        now,
        record.clockResetAt,
      );
      const pending = record.evidence.some((e) => e.decision === 'pending');
      const display =
        record.status !== 'open'
          ? record.status
          : pending
            ? 'under_review'
            : record.deadlineAt && now.getTime() > new Date(record.deadlineAt).getTime()
              ? 'overdue'
              : 'open';
      return {
        ...record,
        memberName: members.find((m) => m.id === record.memberId)?.name ?? 'Unknown member',
        title: this.title(record.type, record.roundId),
        display,
        marks,
        pickFixtureIds: picks.filter((p) => p.dutyId === record.id).map((p) => p.fixtureId),
      };
    });
  });
  readonly marks = computed<readonly MemberMarks[]>(() => {
    const totals = new Map<string, MemberMarks>();
    for (const duty of this.duties()) {
      const entry = totals.get(duty.memberId) ?? {
        memberId: duty.memberId,
        memberName: duty.memberName,
        marks: 0,
        openDuties: 0,
      };
      totals.set(duty.memberId, {
        ...entry,
        marks: entry.marks + duty.marks.marks,
        openDuties: entry.openDuties + (duty.status === 'open' || duty.status === 'pending_deadline' ? 1 : 0),
      });
    }
    return [...totals.values()].sort((a, b) => b.marks - a.marks || a.memberName.localeCompare(b.memberName));
  });
  private readonly pollRecords: WritableSignal<readonly Poll[]>;
  readonly polls: Signal<readonly Poll[]>;
  readonly notes: Signal<readonly RoundNote[]>;
  private readonly feedRecords: WritableSignal<readonly FeedItem[]>;
  readonly feed: Signal<readonly FeedItem[]>;
  private readonly readState: WritableSignal<NotificationsRead>;
  readonly read: Signal<NotificationsRead>;

  constructor(seed: SampleLeagueSeed, competition: CompetitionService) {
    this.seed = seed;
    this.me = signal(seed.summary.memberId);
    this.captainState = signal(seed.captainId);
    this.captain = this.captainState.asReadonly();
    this.nameState = signal(seed.summary.name);
    this.name = this.nameState.asReadonly();
    this.zoneState = signal(seed.summary.timezone);
    this.timezone = this.zoneState.asReadonly();
    this.competition = competition;
    this.memberRecords = signal(seed.members);
    this.members = this.memberRecords.asReadonly();
    this.standingRecords = signal(seed.standings);
    this.pickRecords = signal(seed.picks);
    this.rulesState = signal(withDefaultRules(seed.summary.rules));
    this.rules = this.rulesState.asReadonly();
    this.code = signal<string | null>(seed.joinCode);
    this.joinCode = this.code.asReadonly();
    const { emblemPreset, emblemUrl, accentColour } = seed.summary;
    this.look = signal<LeagueAppearance>({ emblemPreset, emblemUrl, accentColour });
    this.appearance = this.look.asReadonly();
    this.dutyRecords = signal<readonly DutyRecord[]>(seed.duties);
    this.pollRecords = signal<readonly Poll[]>(seed.polls);
    this.polls = this.pollRecords.asReadonly();
    this.notes = signal(seed.notes).asReadonly();
    this.feedRecords = signal<readonly FeedItem[]>(seed.feed);
    this.feed = this.feedRecords.asReadonly();
    this.readState = signal<NotificationsRead>(loadStoredRead(seed.summary.slug));
    this.read = this.readState.asReadonly();
  }

  /** The sample member here, or null where the sample account is only the admin. */
  get memberId(): string | null {
    return this.me();
  }

  /** The league as the account document lists it now. */
  readonly summary = computed<LeagueSummary>(() => {
    const me = this.me();
    return {
      ...this.seed.summary,
      name: this.name(),
      timezone: this.timezone(),
      ...this.look(),
      memberId: me,
      isCaptain: !!me && this.captain() === me,
      inSeason: !me || this.meInSeason(),
      rules: this.rulesState(),
    };
  });

  /**
   * Every fixture from the starting round on with a known kickoff, as `GET /picks` answers:
   * the sample results, and the active members' picks, hidden before kickoff from a member
   * who has not picked yet. A fixture with a sample result counts as kicked off.
   */
  readonly picks = computed<readonly FixturePicks[]>(() => {
    const now = this.clock();
    const me = this.me();
    const members = new Map(this.memberRecords().map((m) => [m.id, m.name]));
    const byFixture = new Map<string, MemberPick[]>();
    for (const record of this.pickRecords()) {
      const name = members.get(record.memberId);
      if (name === undefined) continue;
      const { fixtureId, ...pick } = record;
      byFixture.set(fixtureId, [...(byFixture.get(fixtureId) ?? []), { ...pick, memberName: name }]);
    }
    return this.competition
      .current()
      .fixtures.filter((f) => f.round >= this.rulesState().startingRound && !!f.kickoffUtc)
      .map((f) => {
        const picks = byFixture.get(f.id) ?? [];
        const locked = this.locked(f.id, now);
        const myPick = picks.find((p) => p.memberId === me) ?? null;
        return {
          fixtureId: f.id,
          roundId: f.round,
          kickoffUtc: f.kickoffUtc ?? null,
          locked,
          result: sampleResults[f.id] ?? null,
          myPick,
          picks: locked || myPick || !me ? picks : [],
        };
      });
  });

  reload(): void {
    this.clock.set(Date.now());
  }

  /** Renames, moves or archives the league as `PATCH /v1/admin/leagues/{id}` does. */
  update(change: { name?: string; timezone?: string; status?: 'active' | 'archived' }): void {
    if (change.name) this.nameState.set(change.name);
    if (change.timezone) this.zoneState.set(change.timezone);
    if (change.status && change.status !== this.status()) {
      this.statusState.set(change.status);
      if (change.status === 'active') this.post('league_restored', null, `${this.name()} is open again.`, '', null);
    }
  }

  /** Makes an active, claimed member the captain. */
  appoint(memberId: string): void {
    const member = this.memberRecords().find((m) => m.id === memberId);
    this.captainState.set(memberId);
    if (member) this.post('captain_appointed', null, `${member.name} is captain.`, '', member.name);
  }

  /**
   * Adds the sample account as a member outside the season (the admin's "Add me"). Returns
   * whether it was new; a withdrawn membership comes back, still outside the season.
   */
  addAdmin(name: string): boolean {
    if (this.me() && this.memberRecords().some((m) => m.id === this.me())) return false;
    const withdrawn = this.withdrawnRecords().find((m) => m.id === ME);
    this.withdrawnRecords.update((members) => members.filter((m) => m.id !== ME));
    const record = withdrawn
      ? { ...withdrawn, leftAt: null, withdrawalReason: null, inSeason: false }
      : { ...memberRecord(ME, name, name, ''), inSeason: false };
    this.memberRecords.update((members) => [...members, record]);
    this.me.set(ME);
    this.meInSeason.set(false);
    this.post(
      withdrawn ? 'member_returned' : 'member_joined',
      null,
      withdrawn ? `${record.name} is back as admin.` : `${record.name} joined the clubhouse as admin.`,
      '',
      record.name,
    );
    return !withdrawn;
  }

  saveNotificationsRead(read: NotificationsRead): Promise<void> {
    this.readState.set(read);
    storeRead(read, this.seed.summary.slug);
    return Promise.resolve();
  }

  submitEvidence({ dutyIds, note, subjectMemberId, claimedCompletedAt }: EvidenceSubmission): Promise<void> {
    if (!this.memberId) return notAMember();
    const subject = subjectMemberId ?? ME;
    const now = new Date().toISOString();
    const submissionId = `sub-${Date.now()}`;
    let touched: DutyRecord[] = [];
    this.dutyRecords.update((duties) =>
      duties.map((duty) => {
        if (!dutyIds.includes(duty.id) || duty.memberId !== subject || duty.status !== 'open') return duty;
        const evidence: DutyEvidence = {
          id: `link-${duty.id}-${Date.now()}`,
          submissionId,
          assetId: `asset-${submissionId}`,
          decision: 'pending',
          submittedAt: now,
          claimedCompletedAt: claimedCompletedAt ?? null,
          decidedAt: null,
          reason: null,
          effectiveCompletedAt: null,
          note,
          submitterId: ME,
          submitterName: 'You',
        };
        const next = { ...duty, evidence: [evidence, ...duty.evidence] };
        touched = [...touched, next];
        return next;
      }),
    );
    if (!touched.length) return Promise.reject(new Error('That duty is no longer open.'));
    const name = this.memberRecords().find((m) => m.id === subject)?.name ?? 'Member';
    this.post('evidence_submitted', touched[0].roundId, `${name} submitted evidence for ${touched.map((d) => this.title(d.type, d.roundId)).join(', ')}.`, subject === ME ? 'Waiting for an uninvolved reviewer.' : 'Recorded by the captain.', name);
    return Promise.resolve();
  }

  createDuty(duty: NewDuty): Promise<void> {
    if (!this.memberId) return notAMember();
    const member = this.memberRecords().find((m) => m.id === duty.memberId);
    if (!member) return Promise.reject(new Error('Unknown member.'));
    if (this.dutyRecords().some((d) => d.memberId === duty.memberId && d.roundId === duty.roundId && d.type === duty.type && (d.status === 'open' || d.status === 'pending_deadline')))
      return Promise.reject(new Error('That member already has a live duty of this type in this round.'));
    const deadlineAt = duty.deadlineAt ?? (duty.type === 'spoon' ? this.competition.current().firstKickoff(duty.roundId + 1) : null);
    const id = `duty-${Date.now()}`;
    const fixtureIds = duty.type === 'pick_confirmation' ? (duty.pickFixtureIds ?? []) : [];
    if (fixtureIds.some((fixtureId) => !this.fixture(fixtureId)))
      return refuse(404, 'unknown_fixture', 'That match is not in the schedule.');
    // The member's picks there are linked to the duty; missing ones are recorded as missed.
    this.pickRecords.update((records) => [
      ...records.map((p) =>
        p.memberId === duty.memberId && fixtureIds.includes(p.fixtureId) ? { ...p, dutyId: id } : p,
      ),
      ...fixtureIds
        .filter((fixtureId) => !records.some((p) => p.memberId === duty.memberId && p.fixtureId === fixtureId))
        .map((fixtureId) => ({
          fixtureId,
          memberId: duty.memberId,
          side: 'missed' as const,
          margin: null,
          isDefault: false,
          dutyId: id,
        })),
    ]);
    this.dutyRecords.update((duties) => [
      ...duties,
      {
        id,
        memberId: duty.memberId,
        roundId: duty.roundId,
        type: duty.type,
        reason: duty.reason,
        deadlineAt,
        status: deadlineAt ? 'open' : 'pending_deadline',
        completedAt: null,
        clockResetAt: null,
        voidReason: null,
        createdAt: new Date().toISOString(),
        evidence: [],
      },
    ]);
    this.post('duty_created', duty.roundId, `${member.name}: ${this.title(duty.type, duty.roundId)}.`, duty.reason || (deadlineAt ? '' : 'Deadline to be confirmed.'), member.name);
    return Promise.resolve();
  }

  voidDuty(dutyId: string, reason: string): Promise<void> {
    if (!this.memberId) return notAMember();
    const duty = this.dutyRecords().find((d) => d.id === dutyId);
    if (!duty || duty.status === 'voided' || duty.status === 'completed')
      return Promise.reject(new Error('A completed or voided duty cannot be voided.'));
    this.dutyRecords.update((duties) =>
      duties.map((d) =>
        d.id === dutyId
          ? { ...d, status: 'voided', voidReason: reason, evidence: d.evidence.map((e) => (e.decision === 'pending' ? { ...e, decision: 'superseded' } : e)) }
          : d,
      ),
    );
    const name = this.memberRecords().find((m) => m.id === duty.memberId)?.name ?? 'Member';
    this.post('duty_voided', duty.roundId, `${name}: ${this.title(duty.type, duty.roundId)} voided.`, reason, name);
    return Promise.resolve();
  }

  resetClock(dutyId: string, reason: string): Promise<void> {
    if (!this.memberId) return notAMember();
    const duty = this.dutyRecords().find((d) => d.id === dutyId);
    if (!duty || duty.status !== 'open') return Promise.reject(new Error('Only an open duty’s clock can be reset.'));
    if (duty.memberId === ME)
      return Promise.reject(new Error('A challenge about your own duty needs an uninvolved decision.'));
    this.dutyRecords.update((duties) =>
      duties.map((d) => (d.id === dutyId ? { ...d, clockResetAt: new Date().toISOString() } : d)),
    );
    const name = this.memberRecords().find((m) => m.id === duty.memberId)?.name ?? 'Member';
    this.post('duty_clock_reset', duty.roundId, `${name}: ${this.title(duty.type, duty.roundId)} clock reset.`, reason, name);
    return Promise.resolve();
  }

  decideEvidence(linkId: string, decision: 'accepted' | 'rejected', reason: string): Promise<void> {
    if (!this.memberId) return notAMember();
    const duty = this.dutyRecords().find((d) => d.evidence.some((e) => e.id === linkId));
    const link = duty?.evidence.find((e) => e.id === linkId);
    if (!duty || !link || link.decision !== 'pending') return Promise.reject(new Error('This evidence was already decided.'));
    if (duty.memberId === ME) return Promise.reject(new Error('Your own evidence needs an uninvolved reviewer.'));
    const effective = link.submitterId === duty.memberId ? link.submittedAt : (link.claimedCompletedAt ?? link.submittedAt);
    const now = new Date().toISOString();
    this.dutyRecords.update((duties) =>
      duties.map((d) =>
        d.id !== duty.id
          ? d
          : {
              ...d,
              status: decision === 'accepted' ? 'completed' : d.status,
              completedAt: decision === 'accepted' ? effective : d.completedAt,
              evidence: d.evidence.map((e) =>
                e.id === linkId
                  ? { ...e, decision, decidedAt: now, reason, effectiveCompletedAt: decision === 'accepted' ? effective : null }
                  : decision === 'accepted' && e.decision === 'pending'
                    ? { ...e, decision: 'superseded' }
                    : e,
              ),
            },
      ),
    );
    const name = this.memberRecords().find((m) => m.id === duty.memberId)?.name ?? 'Member';
    this.post(decision === 'accepted' ? 'evidence_accepted' : 'evidence_rejected', duty.roundId, `${name}: ${this.title(duty.type, duty.roundId)} ${decision === 'accepted' ? 'completed' : 'evidence rejected'}.`, reason, name);
    return Promise.resolve();
  }

  addMember(member: NewMember): Promise<void> {
    const id = `member-${Date.now()}`;
    this.memberRecords.update((members) => [
      ...members,
      { ...memberRecord(id, member.name, member.fullName, ''), claimed: false, email: member.email },
    ]);
    this.post('member_added', null, `${member.name} was added to the league.`, '', member.name);
    return Promise.resolve();
  }

  releaseMember(memberId: string): Promise<void> {
    if (memberId === this.captain())
      return Promise.reject(new Error('The captain’s own membership cannot be released.'));
    this.memberRecords.update((members) =>
      members.map((m) => (m.id === memberId ? { ...m, claimed: false } : m)),
    );
    return Promise.resolve();
  }

  updateMember(memberId: string, email: string | null): Promise<void> {
    this.memberRecords.update((members) => members.map((m) => (m.id === memberId ? { ...m, email } : m)));
    return Promise.resolve();
  }

  castVote(pollId: string, choice: string): Promise<void> {
    if (!this.memberId) return notAMember();
    const poll = this.pollRecords().find((p) => p.id === pollId);
    if (!poll || poll.status !== 'Open' || !poll.options.includes(choice))
      return Promise.reject(new Error('This vote is closed.'));
    this.pollRecords.update((polls) =>
      polls.map((p) =>
        p.id === pollId
          ? { ...p, myChoice: choice, participants: p.participants + (p.myChoice ? 0 : 1) }
          : p,
      ),
    );
    return Promise.resolve();
  }

  /**
   * Off the team sheet, as the API does it: open duties voided, standings and marks kept
   * (hidden while withdrawn). An unclaimed name without records is deleted instead.
   */
  withdrawMember(memberId: string, reason: string): Promise<void> {
    const text = reason.trim();
    if (!text || text.length > 500) return refuse(422, 'validation', 'Give a reason of up to 500 characters.');
    if (memberId === this.captain())
      return refuse(409, 'captain_membership', 'The captain cannot be removed. Appoint another captain first.');
    if (memberId === this.memberId) return refuse(409, 'own_membership', 'You cannot remove yourself.');
    if (this.withdrawnRecords().some((m) => m.id === memberId))
      return refuse(409, 'already_withdrawn', 'That member was already removed.');
    const member = this.memberRecords().find((m) => m.id === memberId);
    if (!member) return refuse(404, 'unknown_member', 'That member is not on the team sheet.');
    this.memberRecords.update((members) => members.filter((m) => m.id !== memberId));
    if (!member.claimed && !this.hasRecords(memberId)) return Promise.resolve();
    this.withdrawnRecords.update((members) => [
      { ...member, leftAt: new Date().toISOString(), withdrawalReason: text },
      ...members,
    ]);
    this.dutyRecords.update((duties) =>
      duties.map((d) =>
        d.memberId === memberId && (d.status === 'open' || d.status === 'pending_deadline')
          ? { ...d, status: 'voided', voidReason: 'Member withdrawn' }
          : d,
      ),
    );
    this.post('member_left', null, `${member.name} left the clubhouse.`, '', member.name);
    return Promise.resolve();
  }

  reinstateMember(memberId: string): Promise<void> {
    const member = this.withdrawnRecords().find((m) => m.id === memberId);
    if (!member) return refuse(409, 'not_withdrawn', 'That member is on the team sheet already.');
    this.withdrawnRecords.update((members) => members.filter((m) => m.id !== memberId));
    this.memberRecords.update((members) => [
      ...members,
      { ...member, leftAt: null, withdrawalReason: null },
    ]);
    this.post('member_returned', null, `${member.name} is back.`, '', member.name);
    return Promise.resolve();
  }

  rotateJoinCode(): Promise<string> {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    this.code.set(code);
    return Promise.resolve(code);
  }

  closeJoinCode(): Promise<void> {
    this.code.set(null);
    return Promise.resolve();
  }

  saveAppearance({ emblem, accentColour }: AppearanceChange): Promise<LeagueAppearance> {
    if (emblem && 'preset' in emblem && !isEmblemPreset(emblem.preset))
      return refuse(422, 'invalid_emblem', 'Choose one of the preset emblems.');
    if (emblem && 'image' in emblem && !/^data:image\/jpeg;base64,/.test(emblem.image))
      return refuse(422, 'unknown_upload', 'The emblem upload failed. Try again.');
    if (accentColour !== undefined && accentColour !== null && !isAccentColour(accentColour))
      return refuse(422, 'validation', 'Choose a colour as #rrggbb.');
    const next: LeagueAppearance = {
      ...this.look(),
      ...(emblem === null ? { emblemPreset: null, emblemUrl: null } : {}),
      ...(emblem && 'preset' in emblem ? { emblemPreset: emblem.preset, emblemUrl: null } : {}),
      ...(emblem && 'image' in emblem ? { emblemPreset: null, emblemUrl: emblem.image } : {}),
      ...(accentColour !== undefined ? { accentColour } : {}),
    };
    const changed =
      next.emblemPreset !== this.look().emblemPreset || next.emblemUrl !== this.look().emblemUrl;
    this.look.set(next);
    if (changed) this.post('emblem_updated', null, `The ${this.name()} emblem was updated.`, '', null);
    return Promise.resolve(next);
  }

  /** The member's own pick, before kickoff, as `PUT /matches/{id}/picks/me` does it. */
  savePick(fixtureId: string, pick: NewPick): Promise<void> {
    const me = this.memberId;
    if (!me) return notAMember();
    if (!this.fixture(fixtureId)) return refuse(404, 'unknown_fixture', 'That match is not in the schedule.');
    if (this.locked(fixtureId, Date.now()))
      return refuse(422, 'picks_locked', 'Picks for this match closed at kickoff.');
    if (!validPick(pick, false)) return invalidPick();
    const kept = this.pickRecords().find((p) => p.fixtureId === fixtureId && p.memberId === me);
    this.upsertPicks(fixtureId, [
      { memberId: me, side: pick.side, margin: pick.margin, isDefault: false, dutyId: kept?.dutyId ?? null },
    ]);
    return Promise.resolve();
  }

  /** Steward: records the listed members' picks at any time, as `PUT /matches/{id}/picks`. */
  recordPicks(fixtureId: string, picks: readonly StewardPick[]): Promise<void> {
    if (!this.fixture(fixtureId)) return refuse(404, 'unknown_fixture', 'That match is not in the schedule.');
    const ids = picks.map((p) => p.memberId);
    if (new Set(ids).size !== ids.length)
      return refuse(422, 'duplicate_member', 'Each member can have one pick per match.');
    const active = new Set(this.memberRecords().map((m) => m.id));
    if (ids.some((id) => !active.has(id))) return refuse(404, 'unknown_member', 'That member is not on the team sheet.');
    if (picks.some((p) => !validPick(p, p.isDefault ?? false))) return invalidPick();
    const duties = this.dutyRecords();
    if (
      picks.some(
        (p) =>
          p.dutyId &&
          !duties.some((d) => d.id === p.dutyId && d.memberId === p.memberId && d.type === 'pick_confirmation'),
      )
    )
      return refuse(404, 'unknown_duty', 'That pick confirmation duty is not this member’s.');
    const records = this.pickRecords();
    // Like the API: an omitted dutyId keeps the existing link, an explicit null unlinks it.
    const kept = (memberId: string) =>
      records.find((r) => r.fixtureId === fixtureId && r.memberId === memberId)?.dutyId ?? null;
    this.upsertPicks(
      fixtureId,
      picks.map((p) => ({
        memberId: p.memberId,
        side: p.side,
        margin: p.margin,
        isDefault: p.isDefault ?? false,
        dutyId: p.dutyId !== undefined ? p.dutyId : kept(p.memberId),
      })),
    );
    return Promise.resolve();
  }

  /** Steward: removes a member's pick. */
  removePick(fixtureId: string, memberId: string): Promise<void> {
    this.pickRecords.update((records) =>
      records.filter((p) => !(p.fixtureId === fixtureId && p.memberId === memberId)),
    );
    return Promise.resolve();
  }

  /** Steward: changes some rules, validated like `PUT /rules`. */
  saveRules(change: Partial<LeagueRules>): Promise<void> {
    const next = withDefaultRules({ ...this.rulesState(), ...change, winPoints: { ...this.rulesState().winPoints, ...change.winPoints } });
    const numbers = [
      next.marginPoint,
      next.marginWindow,
      next.bonusPointValue,
      next.bonusPointMinimumShare,
      next.bonusRange,
      next.grandSlamPoints,
      ...Object.values(next.winPoints),
    ];
    if (numbers.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0))
      return refuse(422, 'validation', 'Points and ranges must be zero or more.');
    const lastRound = this.competition.current().lastRound;
    if (!Number.isInteger(next.startingRound) || next.startingRound < 1 || next.startingRound > lastRound)
      return refuse(422, 'validation', `The starting round must be between 1 and ${lastRound}.`);
    const champion = next.previousChampionMemberId;
    if (champion && ![...this.memberRecords(), ...this.withdrawnRecords()].some((m) => m.id === champion))
      return refuse(404, 'unknown_member', 'The previous champion must be a member of this league.');
    this.rulesState.set(next);
    this.post('rules_updated', null, 'Superbru rules updated.', '', null);
    return Promise.resolve();
  }

  /** Steward: replaces a round's recorded totals; members left out lose theirs. */
  recordStandings(roundId: number, entries: readonly StandingEntry[]): Promise<void> {
    const members = this.memberRecords();
    if (entries.some((e) => !members.some((m) => m.id === e.memberId)))
      return refuse(404, 'unknown_member', 'That member is not on the team sheet.');
    if (entries.some((e) => !Number.isFinite(e.points) || e.points < 0))
      return refuse(422, 'validation', 'Points must be zero or more.');
    const ranked = rankRows(
      entries.map((e) => ({
        memberId: e.memberId,
        memberName: members.find((m) => m.id === e.memberId)?.name ?? '',
        points: e.points,
        wp: 0,
        mp: 0,
        distance: 0,
      })),
    );
    this.standingRecords.update((rows) => [
      ...rows.filter((row) => row.roundId !== roundId),
      ...ranked.map(({ memberId, rank, points }) => ({ roundId, memberId, rank, points })),
    ]);
    const leaders = ranked.filter((row) => row.rank === 1).map((row) => row.memberName);
    const code = this.competition.current().roundCode(roundId);
    this.post(
      'standings_recorded',
      roundId,
      `Round ${code} Superbru standings updated.`,
      leaders.length
        ? `${leaders.join(' and ')} ${leaders.length === 1 ? 'leads' : 'lead'} on ${ranked[0].points} points.`
        : '',
      null,
    );
    return Promise.resolve();
  }

  /** Steward: clears one member's recorded total for a round. */
  clearStanding(roundId: number, memberId: string): Promise<void> {
    this.standingRecords.update((rows) =>
      rows.filter((row) => !(row.roundId === roundId && row.memberId === memberId)),
    );
    return Promise.resolve();
  }

  /** Duties, picks or round standings on record, which keep a name from being deleted. */
  private hasRecords(memberId: string): boolean {
    return (
      this.dutyRecords().some((d) => d.memberId === memberId) ||
      this.pickRecords().some((p) => p.memberId === memberId) ||
      this.standingRecords().some((s) => s.memberId === memberId)
    );
  }

  private fixture(fixtureId: string) {
    return this.competition.current().fixtures.find((f) => f.id === fixtureId);
  }

  /** Kicked off, or already carrying a sample result. */
  private locked(fixtureId: string, now: number): boolean {
    const kickoff = this.fixture(fixtureId)?.kickoffUtc;
    return !!sampleResults[fixtureId] || (!!kickoff && Date.parse(kickoff) <= now);
  }

  private upsertPicks(fixtureId: string, picks: readonly Omit<SamplePickRecord, 'fixtureId'>[]): void {
    const ids = new Set(picks.map((p) => p.memberId));
    this.pickRecords.update((records) => [
      ...records.filter((p) => !(p.fixtureId === fixtureId && ids.has(p.memberId))),
      ...picks.map((p) => ({ ...p, fixtureId })),
    ]);
  }

  /** `Round 03 Spoon duty`, with the round labelled as the competition labels it. */
  private title(type: Duty['type'], roundId: number | null): string {
    const competition = this.competition.current();
    return title(type, roundId, (id) => competition.roundCode(id));
  }

  private post(kind: FeedItem['kind'], roundId: number | null, titleText: string, detail: string, subjectName: string | null): void {
    this.feedRecords.update((items) => [
      feedItem(`feed-${Date.now()}`, kind, roundId, titleText, detail, new Date().toISOString(), subjectName),
      ...items,
    ]);
  }
}


/** `?sampleAdmin=0` on the first page makes the sample account a plain member. */
function sampleAdmin(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('sampleAdmin') !== '0';
  } catch {
    return true;
  }
}

/** A pick the API accepts: home or away by 1–150, a draw by 0, missed without a margin. */
function validPick(pick: NewPick, isDefault: boolean): boolean {
  if (isDefault && pick.side !== 'home' && pick.side !== 'away') return false;
  switch (pick.side) {
    case 'home':
    case 'away':
      return Number.isInteger(pick.margin) && pick.margin! >= 1 && pick.margin! <= 150;
    case 'draw':
      return pick.margin === 0;
    case 'missed':
      return pick.margin === null;
    default:
      return false;
  }
}

function invalidPick<T>(): Promise<T> {
  return refuse(422, 'invalid_pick', 'Pick a side and a margin from 1 to 150, or a draw.');
}

function refuse<T>(status: number, code: string, message: string): Promise<T> {
  return Promise.reject(new ApiError(status, code, message));
}

/** The admin viewing a league it is not in cannot do what is recorded against a member. */
function notAMember<T>(): Promise<T> {
  return refuse(409, 'admin_not_a_member', 'Add yourself to this league from the management centre first.');
}
