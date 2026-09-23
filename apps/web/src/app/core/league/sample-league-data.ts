import { Injectable, signal } from '@angular/core';
import { LeagueData } from './league-data';
import {
  Duty,
  EvidenceSubmission,
  LeagueMember,
  Poll,
  ReviewItem,
  RoundNote,
  RoundStanding,
} from './league.models';

const ME = 'member-me';

const MEMBERS: readonly LeagueMember[] = [
  { id: 'member-jp', name: 'Johan Pretorius', initials: 'JP', teamId: 'dhl-stormers' },
  { id: 'member-pw', name: 'Pieter Wessels', initials: 'PW', teamId: 'vodacom-bulls' },
  { id: ME, name: 'You', initials: 'ME', teamId: 'hollywoodbets-sharks' },
  { id: 'member-fb', name: 'Franco Botha', initials: 'FB', teamId: 'munster-rugby' },
  { id: 'member-lm', name: 'Liam Meyer', initials: 'LM', teamId: 'leinster-rugby' },
  { id: 'member-as', name: 'Arno Smit', initials: 'AS', teamId: '10bet-lions' },
];

function table(roundId: number, order: number[], points: number[], marks: number[]) {
  return order.map((member, index): RoundStanding => ({
    roundId,
    memberId: MEMBERS[member].id,
    rank: index + 1,
    points: points[index],
    marks: marks[index],
  }));
}

/**
 * Illustrative league records for local development only. Names, points, duties and
 * votes are samples, never published competition results.
 */
@Injectable()
export class SampleLeagueData extends LeagueData {
  readonly source = 'sample';
  readonly currentMemberId = ME;
  readonly captainMemberId = signal<string | null>(ME).asReadonly();
  readonly members = signal(MEMBERS).asReadonly();
  readonly standings = signal<readonly RoundStanding[]>([
    ...table(1, [1, 0, 2, 4, 5, 3], [15, 13.5, 12, 10, 8.5, 6], [0, 0, 0, 0, 0, 0]),
    ...table(2, [0, 3, 1, 5, 4, 2], [16, 14, 12, 10.5, 9, 5.5], [0, 0, 0, 0, 2, 1]),
  ]).asReadonly();
  private readonly dutyRecords = signal<readonly Duty[]>([
    {
      id: 'duty-1',
      roundId: 1,
      memberId: 'member-fb',
      title: 'Round 1 Spoon duty',
      deadline: '02 Oct 2026 · 20:00 SAST',
      status: 'Completed',
      marks: 0,
    },
    {
      id: 'duty-2',
      roundId: 2,
      memberId: ME,
      title: 'Round 2 Spoon duty',
      deadline: '11 Oct 2026 · 20:00 SAST',
      status: 'Open',
      marks: 1,
    },
    {
      id: 'duty-3',
      roundId: 2,
      memberId: 'member-lm',
      title: 'Round 2 pick confirmation',
      deadline: '11 Oct 2026 · 20:00 SAST',
      status: 'Awaiting review',
      marks: 2,
    },
  ]);
  readonly duties = this.dutyRecords.asReadonly();
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
  readonly reviews = signal<readonly ReviewItem[]>([
    { id: 'review-1', roundId: 2, title: 'Liam’s Round 2 evidence' },
    { id: 'review-2', roundId: 2, title: 'Round 2 result import finding' },
    { id: 'review-3', roundId: 3, title: 'Confirm the Round 3 schedule' },
  ]).asReadonly();
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

  submitEvidence({ dutyId }: EvidenceSubmission): Promise<void> {
    this.dutyRecords.update((duties) =>
      duties.map((duty) =>
        duty.id === dutyId && duty.memberId === ME && duty.status === 'Open'
          ? { ...duty, status: 'Awaiting review' }
          : duty,
      ),
    );
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
}
