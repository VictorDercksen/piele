import { Injectable, computed, signal } from '@angular/core';
import { firstKickoff } from '../competition/competition.service';
import { LeagueData } from './league-data';
import {
  Duty,
  DutyEvidence,
  EvidenceSubmission,
  FeedItem,
  LeagueMember,
  MemberMarks,
  NewDuty,
  NewMember,
  Poll,
  RoundNote,
  RoundStanding,
} from './league.models';
import { sampleMarks } from './marks';

const ME = 'member-me';

const MEMBERS: readonly LeagueMember[] = [
  memberRecord('member-jp', 'Johan', 'Pretorius, Johan', 'dhl-stormers'),
  memberRecord('member-pw', 'PieterW', 'Wessels, Pieter', 'vodacom-bulls'),
  memberRecord(ME, 'You', 'You', 'hollywoodbets-sharks'),
  memberRecord('member-fb', 'Franco', 'Botha, Franco', 'munster-rugby'),
  memberRecord('member-lm', 'Liam', 'Meyer, Liam', 'leinster-rugby'),
  memberRecord('member-as', 'Arno', 'Smit, Arno', '10bet-lions'),
];

function memberRecord(id: string, name: string, fullName: string, teamId: string): LeagueMember {
  return {
    id,
    name,
    fullName,
    initials: name.slice(0, 2).toUpperCase(),
    teamId,
    claimed: true,
    inSeason: true,
  };
}

function table(roundId: number, order: number[], points: number[]) {
  return order.map((member, index): RoundStanding => ({
    roundId,
    memberId: MEMBERS[member].id,
    rank: index + 1,
    points: points[index],
  }));
}

interface DutyRecord {
  readonly id: string;
  readonly memberId: string;
  readonly roundId: number | null;
  readonly type: Duty['type'];
  readonly reason: string;
  readonly deadlineAt: string | null;
  readonly status: Duty['status'];
  readonly completedAt: string | null;
  readonly clockResetAt: string | null;
  readonly voidReason: string | null;
  readonly createdAt: string;
  readonly evidence: readonly DutyEvidence[];
}

function title(type: Duty['type'], roundId: number | null): string {
  const label = type === 'spoon' ? 'Spoon duty' : 'Pick confirmation';
  if (roundId === null) return label;
  const code = roundId <= 18 ? String(roundId).padStart(2, '0') : { 19: 'QF', 20: 'SF', 21: 'F' }[roundId];
  return `Round ${code} ${label}`;
}

/**
 * Illustrative league records for local development only. Names, points, duties and
 * votes are samples, never published competition results.
 */
@Injectable()
export class SampleLeagueData extends LeagueData {
  readonly source = 'sample';
  readonly currentMemberId = signal<string | null>(ME).asReadonly();
  readonly currentMemberName = signal<string | null>(null).asReadonly();
  readonly captainMemberId = signal<string | null>(ME).asReadonly();
  readonly loading = signal(false).asReadonly();
  readonly error = signal<string | null>(null).asReadonly();
  private readonly memberRecords = signal(MEMBERS);
  readonly members = this.memberRecords.asReadonly();
  readonly standings = signal<readonly RoundStanding[]>([
    ...table(1, [1, 0, 2, 4, 5, 3], [15, 13.5, 12, 10, 8.5, 6]),
    ...table(2, [0, 3, 1, 5, 4, 2], [16, 14, 12, 10.5, 9, 5.5]),
  ]).asReadonly();
  private readonly dutyRecords = signal<readonly DutyRecord[]>([
    {
      id: 'duty-1',
      memberId: 'member-fb',
      roundId: 1,
      type: 'spoon',
      reason: 'Last place in Round 01.',
      deadlineAt: '2026-10-02T18:45:00Z',
      status: 'completed',
      completedAt: '2026-09-27T14:10:00Z',
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-09-26T08:00:00Z',
      evidence: [
        {
          id: 'link-1',
          submissionId: 'sub-1',
          assetId: 'asset-1',
          decision: 'accepted',
          submittedAt: '2026-09-27T14:10:00Z',
          claimedCompletedAt: null,
          decidedAt: '2026-09-27T19:00:00Z',
          reason: 'Clear video, spoon and beer both visible.',
          effectiveCompletedAt: '2026-09-27T14:10:00Z',
          note: 'Done at the braai.',
          submitterId: 'member-fb',
          submitterName: 'Franco',
        },
      ],
    },
    {
      id: 'duty-2',
      memberId: ME,
      roundId: 2,
      type: 'spoon',
      reason: 'Last place in Round 02.',
      deadlineAt: '2026-10-09T18:45:00Z',
      status: 'open',
      completedAt: null,
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-10-03T08:00:00Z',
      evidence: [],
    },
    {
      id: 'duty-3',
      memberId: 'member-lm',
      roundId: 2,
      type: 'pick_confirmation',
      reason: 'Two picks missing on the Superbru round page.',
      deadlineAt: '2026-10-09T18:45:00Z',
      status: 'open',
      completedAt: null,
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-10-03T08:05:00Z',
      evidence: [
        {
          id: 'link-3',
          submissionId: 'sub-3',
          assetId: 'asset-3',
          decision: 'pending',
          submittedAt: '2026-10-04T10:30:00Z',
          claimedCompletedAt: null,
          decidedAt: null,
          reason: null,
          effectiveCompletedAt: null,
          note: 'Picks confirmed on the app, screen recording attached.',
          submitterId: 'member-lm',
          submitterName: 'Liam',
        },
      ],
    },
    {
      id: 'duty-4',
      memberId: 'member-as',
      roundId: 1,
      type: 'pick_confirmation',
      reason: 'No picks recorded for Round 01.',
      deadlineAt: '2026-09-01T18:45:00Z',
      status: 'open',
      completedAt: null,
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-08-30T08:00:00Z',
      evidence: [],
    },
  ]);
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
        title: title(record.type, record.roundId),
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
  private readonly pollRecords = signal<readonly Poll[]>([
    {
      id: 'poll-1',
      roundId: 1,
      question: 'Accept the Round 1 fixture correction?',
      description: 'The corrected Glasgow–Stormers result was reviewed by the league.',
      options: ['Accept correction', 'Keep original result', 'Abstain'],
      closes: '29 Sep 2026 · 21:00 SAST',
      status: 'Closed',
      participants: 10,
      eligible: 12,
      result: 'Correction accepted · 8 for, 1 against, 1 abstention.',
    },
    {
      id: 'poll-2',
      roundId: 2,
      question: 'Accept the Round 2 result correction?',
      description: 'Review the proposed result correction before the round is finalised.',
      options: ['Accept correction', 'Keep original result', 'Abstain'],
      closes: '10 Oct 2026 · 21:00 SAST',
      status: 'Open',
      participants: 7,
      eligible: 12,
    },
    {
      id: 'poll-3',
      roundId: 3,
      question: 'Confirm the Round 3 pick deadline?',
      description: 'Review the proposed 18:45 SAST deadline before the opening fixture.',
      options: ['Confirm 18:45 SAST', 'Request a review', 'Abstain'],
      closes: '08 Oct 2026 · 21:00 SAST',
      status: 'Open',
      participants: 8,
      eligible: 12,
    },
  ]);
  readonly polls = this.pollRecords.asReadonly();
  readonly notes = signal<readonly RoundNote[]>([
    {
      roundId: 1,
      deadline: '25 Sep 2026 · 19:00 SAST',
      activity: 'Pieter wins Round 1 with 15.0 points. Franco’s evidence was accepted.',
    },
    {
      roundId: 2,
      deadline: '02 Oct 2026 · 18:45 SAST',
      activity:
        'Johan leads Round 2 with 16.0 points. A result correction is awaiting the league’s decision.',
    },
    {
      roundId: 3,
      deadline: '09 Oct 2026 · 18:45 SAST',
      activity: 'Round 3 standings and duties will appear after results are recorded.',
    },
  ]).asReadonly();
  private readonly feedRecords = signal<readonly FeedItem[]>([
    feedItem('feed-9', 'evidence_submitted', 2, 'Liam submitted evidence for Round 02 Pick confirmation.', 'Waiting for an uninvolved reviewer.', '2026-10-04T10:30:00Z', 'Liam'),
    feedItem('feed-8', 'duty_created', 2, 'You: Round 02 Spoon duty.', 'Last place in Round 02.', '2026-10-03T08:00:00Z', 'You'),
    feedItem('feed-7', 'duty_created', 2, 'Liam: Round 02 Pick confirmation.', 'Two picks missing on the Superbru round page.', '2026-10-03T08:05:00Z', 'Liam'),
    feedItem('feed-6', 'match_result', 2, 'Glasgow Warriors 24–19 DHL Stormers.', 'Round 02 opener. Johan called it.', '2026-10-02T20:40:00Z', null),
    feedItem('feed-5', 'poll_opened', 2, 'Vote: accept the Round 2 result correction?', 'Closes 10 Oct 2026 · 21:00 SAST.', '2026-10-02T09:00:00Z', null),
    feedItem('feed-4', 'evidence_accepted', 1, 'Franco: Round 01 Spoon duty completed.', 'Clear video, spoon and beer both visible.', '2026-09-27T19:00:00Z', 'Franco'),
    feedItem('feed-3', 'evidence_submitted', 1, 'Franco submitted evidence for Round 01 Spoon duty.', 'Done at the braai.', '2026-09-27T14:10:00Z', 'Franco'),
    feedItem('feed-2', 'duty_created', 1, 'Franco: Round 01 Spoon duty.', 'Last place in Round 01.', '2026-09-26T08:00:00Z', 'Franco'),
    feedItem('feed-1', 'season_opened', null, 'URC 2026/27 is open.', '6 members enrolled. You are captain.', '2026-09-20T08:00:00Z', null),
  ]);
  readonly feed = this.feedRecords.asReadonly();

  reload(): void {
    this.clock.set(Date.now());
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
    this.post('evidence_submitted', touched[0].roundId, `${name} submitted evidence for ${touched.map((d) => title(d.type, d.roundId)).join(', ')}.`, subject === ME ? 'Waiting for an uninvolved reviewer.' : 'Recorded by the captain.', name);
    return Promise.resolve();
  }

  createDuty(duty: NewDuty): Promise<void> {
    const member = this.memberRecords().find((m) => m.id === duty.memberId);
    if (!member) return Promise.reject(new Error('Unknown member.'));
    if (this.dutyRecords().some((d) => d.memberId === duty.memberId && d.roundId === duty.roundId && d.type === duty.type && (d.status === 'open' || d.status === 'pending_deadline')))
      return Promise.reject(new Error('That member already has a live duty of this type in this round.'));
    const deadlineAt = duty.deadlineAt ?? (duty.type === 'spoon' ? firstKickoff(duty.roundId + 1) : null);
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
    this.post('duty_created', duty.roundId, `${member.name}: ${title(duty.type, duty.roundId)}.`, duty.reason || (deadlineAt ? '' : 'Deadline to be confirmed.'), member.name);
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
    this.post('duty_voided', duty.roundId, `${name}: ${title(duty.type, duty.roundId)} voided.`, reason, name);
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
    this.post('duty_clock_reset', duty.roundId, `${name}: ${title(duty.type, duty.roundId)} clock reset.`, reason, name);
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
    this.post(decision === 'accepted' ? 'evidence_accepted' : 'evidence_rejected', duty.roundId, `${name}: ${title(duty.type, duty.roundId)} ${decision === 'accepted' ? 'completed' : 'evidence rejected'}.`, reason, name);
    return Promise.resolve();
  }

  playbackUrl(): Promise<string> {
    return Promise.reject(new Error('Sample evidence has no video.'));
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
    if (memberId === ME) return Promise.reject(new Error('The captain’s own membership cannot be released.'));
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

  private post(kind: FeedItem['kind'], roundId: number | null, titleText: string, detail: string, subjectName: string | null): void {
    this.feedRecords.update((items) => [
      feedItem(`feed-${Date.now()}`, kind, roundId, titleText, detail, new Date().toISOString(), subjectName),
      ...items,
    ]);
  }
}

function feedItem(
  id: string,
  kind: FeedItem['kind'],
  roundId: number | null,
  title: string,
  detail: string,
  occurredAt: string,
  subjectName: string | null,
): FeedItem {
  return { id, kind, roundId, title, detail, occurredAt, actorName: 'You', subjectName, dutyId: null };
}
