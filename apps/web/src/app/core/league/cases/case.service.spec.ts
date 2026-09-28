import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FixtureService } from '../../competition/fixture.service';
import { LeagueData, NO_STAND_IN } from '../data/league-data';
import { EvidenceCase } from '../league.models';
import { MemberService } from '../members/member.service';
import { COUNTDOWN_TICK_MS, CaseService } from './case.service';

const evidenceCase = (id: string, change: Partial<EvidenceCase> = {}): EvidenceCase => ({
  id,
  dutyId: `d-${id}`,
  linkId: `l-${id}`,
  submissionId: `s-${id}`,
  assetId: `a-${id}`,
  roundNumber: 2,
  dutyType: 'spoon',
  dutyTitle: 'Round 02 Spoon duty',
  subjectId: 'm-other',
  subjectName: 'Other',
  submitterName: 'Other',
  submittedAt: '2026-10-04T08:00:00Z',
  note: '',
  openedAt: '2026-10-04T08:00:00Z',
  closesAt: '2026-10-05T08:00:00Z',
  status: 'open',
  resolution: null,
  resolvedAt: null,
  eligibleCount: 5,
  respondedCount: 1,
  isVoter: true,
  myResponse: null,
  myVetoReason: null,
  canRespond: true,
  canReview: false,
  vetoReason: null,
  needsReviewer: false,
  ...change,
});

function setup() {
  const data = {
    currentMemberId: signal<string | null>('m-me'),
    cases: signal<readonly EvidenceCase[]>([
      evidenceCase('open'),
      evidenceCase('accepted-by-me', { myResponse: 'accept', respondedCount: 2 }),
      evidenceCase('mine', {
        subjectId: 'm-me',
        subjectName: 'You',
        isVoter: false,
        canRespond: false,
      }),
      evidenceCase('veto', {
        status: 'in_review',
        canRespond: false,
        canReview: true,
        vetoReason: 'Wrong round',
        dutyType: 'pick_confirmation',
      }),
      evidenceCase('stuck', { status: 'in_review', canRespond: false, needsReviewer: true }),
      evidenceCase('earlier', {
        roundNumber: 1,
        status: 'accepted',
        resolution: 'auto',
        canRespond: false,
      }),
      evidenceCase('earlier-vote', { roundNumber: 1 }),
    ]),
    standInReviewer: signal(NO_STAND_IN),
  };
  const round = signal({ id: 2 });
  TestBed.configureTestingModule({
    providers: [
      { provide: LeagueData, useValue: data },
      { provide: FixtureService, useValue: { round } },
      { provide: MemberService, useValue: { memberName: signal('Test Member') } },
    ],
  });
  return { cases: TestBed.inject(CaseService), data, round };
}

describe('CaseService', () => {
  afterEach(() => vi.useRealTimers());

  it('decorates the season’s cases and scopes them to the selected round', () => {
    const { cases, round } = setup();
    expect(cases.seasonCases()).toHaveLength(7);
    expect(
      cases.cases().map((c) => [c.id, c.statusLabel, c.live, c.mine, c.spoon, c.subjectName]),
    ).toEqual([
      ['open', 'VOTING OPEN', true, false, true, 'Other'],
      ['accepted-by-me', 'VOTING OPEN', true, false, true, 'Other'],
      ['mine', 'VOTING OPEN', true, true, true, 'Test Member'],
      ['veto', 'IN REVIEW', true, false, false, 'Other'],
      ['stuck', 'IN REVIEW', true, false, true, 'Other'],
    ]);
    round.set({ id: 1 });
    expect(cases.cases().map((c) => [c.id, c.outcome])).toEqual([
      ['earlier', 'Accepted automatically: no veto within 24 hours'],
      ['earlier-vote', null],
    ]);
  });

  it('finds what waits for the member: responses in the season and round, and rulings', () => {
    const { cases, round } = setup();
    expect(cases.awaitingResponse().map((c) => c.id)).toEqual(['open', 'earlier-vote']);
    expect(cases.roundAwaitingResponse().map((c) => c.id)).toEqual(['open']);
    expect(cases.awaitingReview().map((c) => c.id)).toEqual(['veto']);
    expect(cases.roundAwaitingReview().map((c) => c.id)).toEqual(['veto']);
    expect(cases.reviewQueue().map((c) => c.id)).toEqual(['veto', 'stuck']);
    round.set({ id: 1 });
    expect(cases.roundAwaitingReview()).toEqual([]);
    expect(cases.reviewQueue()).toEqual([]);
  });

  it('counts down to the close and moves with the clock', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(Date.parse('2026-10-05T07:00:00Z'));
    const { cases } = setup();
    const open = cases.cases()[0];
    expect(cases.countdown(open)).toBe('1 h 0 min left');
    vi.advanceTimersByTime(40 * 60_000 + COUNTDOWN_TICK_MS);
    expect(cases.countdown(open)).toBe('19 min left');
    vi.advanceTimersByTime(60 * 60_000);
    expect(cases.countdown(open)).toBe('Closing now');
  });
});
