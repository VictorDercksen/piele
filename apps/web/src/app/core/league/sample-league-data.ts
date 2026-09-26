import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { CompetitionService } from '../competition/competition.service';
import { LeagueData } from './league-data';
import {
  Duty,
  DutyEvidence,
  EvidenceSubmission,
  FeedItem,
  LeagueMember,
  LeagueSummary,
  MemberMarks,
  NewDuty,
  NewMember,
  NotificationsRead,
  Poll,
  RoundNote,
  RoundStanding,
} from './league.models';
import { loadStoredRead, storeRead } from './notifications-read';
import { sampleMarks } from './marks';
import {
  SAMPLE_LEAGUES,
  SAMPLE_ME as ME,
  SampleDutyRecord as DutyRecord,
  SampleLeagueSeed,
  feedItem,
  memberRecord,
} from './sample-leagues';

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
  private readonly active = signal<SampleLeague>(this.league(SAMPLE_LEAGUES[0]));
  readonly source = 'sample';
  /** The slug of the league whose records are showing. */
  readonly slug = computed(() => this.active().seed.summary.slug);
  readonly currentMemberId = signal<string | null>(ME).asReadonly();
  readonly currentMemberName = signal<string | null>(null).asReadonly();
  readonly captainMemberId = computed(() => this.active().seed.captainId);
  readonly loading = signal(false).asReadonly();
  readonly error = signal<string | null>(null).asReadonly();
  readonly members = this.from((league) => league.members);
  readonly standings = this.from((league) => league.standings);
  readonly duties = this.from((league) => league.duties);
  readonly marks = this.from((league) => league.marks);
  readonly polls = this.from((league) => league.polls);
  readonly notes = this.from((league) => league.notes);
  readonly feed = this.from((league) => league.feed);
  readonly notificationsRead = this.from((league) => league.read);

  /** Switches to a sample league's records. Unknown slugs keep the current league. */
  selectLeague(league: LeagueSummary): void {
    const seed = SAMPLE_LEAGUES.find((s) => s.summary.slug === league.slug);
    if (seed) this.active.set(this.league(seed));
  }

  /** The sample league with this slug, whether or not it is showing. */
  seed(slug: string): SampleLeagueSeed | undefined {
    return SAMPLE_LEAGUES.find((s) => s.summary.slug === slug);
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
class SampleLeague {
  readonly seed: SampleLeagueSeed;
  private readonly competition: CompetitionService;
  private readonly memberRecords: WritableSignal<readonly LeagueMember[]>;
  readonly members: Signal<readonly LeagueMember[]>;
  readonly standings: Signal<readonly RoundStanding[]>;
  private readonly dutyRecords: WritableSignal<readonly DutyRecord[]>;
  private readonly clock = signal(Date.now());
  readonly duties = computed<readonly Duty[]>(() => {
    const now = new Date(this.clock());
    const members = this.memberRecords();
    return this.dutyRecords().map((record) => {
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
    this.competition = competition;
    this.memberRecords = signal(seed.members);
    this.members = this.memberRecords.asReadonly();
    this.standings = signal(seed.standings).asReadonly();
    this.dutyRecords = signal<readonly DutyRecord[]>(seed.duties);
    this.pollRecords = signal<readonly Poll[]>(seed.polls);
    this.polls = this.pollRecords.asReadonly();
    this.notes = signal(seed.notes).asReadonly();
    this.feedRecords = signal<readonly FeedItem[]>(seed.feed);
    this.feed = this.feedRecords.asReadonly();
    this.readState = signal<NotificationsRead>(loadStoredRead(seed.summary.slug));
    this.read = this.readState.asReadonly();
  }

  reload(): void {
    this.clock.set(Date.now());
  }

  saveNotificationsRead(read: NotificationsRead): Promise<void> {
    this.readState.set(read);
    storeRead(read, this.seed.summary.slug);
    return Promise.resolve();
  }

  submitEvidence({ dutyIds, note, subjectMemberId, claimedCompletedAt }: EvidenceSubmission): Promise<void> {
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
    const member = this.memberRecords().find((m) => m.id === duty.memberId);
    if (!member) return Promise.reject(new Error('Unknown member.'));
    if (this.dutyRecords().some((d) => d.memberId === duty.memberId && d.roundId === duty.roundId && d.type === duty.type && (d.status === 'open' || d.status === 'pending_deadline')))
      return Promise.reject(new Error('That member already has a live duty of this type in this round.'));
    const deadlineAt = duty.deadlineAt ?? (duty.type === 'spoon' ? this.competition.current().firstKickoff(duty.roundId + 1) : null);
    const id = `duty-${Date.now()}`;
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
    if (memberId === this.seed.captainId)
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

