import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FixtureService } from '../../competition/fixture.service';
import { LeagueData } from '../data/league-data';
import { Duty, DutyEvidence } from '../league.models';
import { MemberService } from '../members/member.service';
import { DutyService } from './duty.service';

const evidence = (id: string, decision: string): DutyEvidence => ({
  id,
  assetId: `asset-${id}`,
  claimedCompletedAt: null,
  decidedAt: null,
  decision,
  effectiveCompletedAt: null,
  note: '',
  reason: null,
  submissionId: `submission-${id}`,
  submittedAt: '2026-09-20T10:00:00Z',
  submitterId: 'm-other',
  submitterName: 'Other',
});

const duty = (id: string, change: Partial<Duty>): Duty => ({
  id,
  memberId: 'm-other',
  memberName: 'Other',
  roundId: 2,
  type: 'spoon',
  title: 'Wooden spoon',
  reason: '',
  deadlineAt: null,
  status: 'open',
  display: 'open',
  completedAt: null,
  clockResetAt: null,
  voidReason: null,
  createdAt: '2026-09-20T10:00:00Z',
  marks: {
    asOf: '2026-09-20T10:00:00Z',
    explanation: '',
    marks: 0,
    nextMarkAt: null,
    overdueHours: 0,
  },
  evidence: [],
  pickFixtureIds: [],
  ...change,
});

function setup() {
  const data = {
    currentMemberId: signal<string | null>('m-me'),
    duties: signal<readonly Duty[]>([
      duty('d-done', {
        memberId: 'm-me',
        memberName: 'Me',
        status: 'completed',
        display: 'completed',
      }),
      duty('d-mine', {
        memberId: 'm-me',
        memberName: 'Me',
        type: 'pick_confirmation',
        display: 'under_review',
        evidence: [evidence('e-mine', 'pending')],
      }),
      duty('d-other', {
        display: 'overdue',
        evidence: [evidence('e-1', 'pending'), evidence('e-2', 'accepted')],
      }),
      duty('d-earlier', { roundId: 1, display: 'pending_deadline' }),
    ]),
    playbackUrl: vi.fn().mockResolvedValue('https://storage.test/video'),
  };
  const round = signal({ id: 2 });
  TestBed.configureTestingModule({
    providers: [
      { provide: LeagueData, useValue: data },
      { provide: FixtureService, useValue: { round } },
      { provide: MemberService, useValue: { memberName: signal('Test Member') } },
    ],
  });
  return { duties: TestBed.inject(DutyService), data, round };
}

describe('DutyService', () => {
  it('decorates the season’s duties and scopes them to the selected round', () => {
    const { duties, round } = setup();
    expect(duties.seasonDuties().map((d) => d.id)).toEqual([
      'd-done',
      'd-mine',
      'd-other',
      'd-earlier',
    ]);
    expect(
      duties.duties().map((d) => [d.id, d.mine, d.spoon, d.memberName, d.statusLabel]),
    ).toEqual([
      ['d-done', true, true, 'Test Member', 'Completed'],
      ['d-mine', true, false, 'Test Member', 'Under review'],
      ['d-other', false, true, 'Other', 'Overdue'],
    ]);
    round.set({ id: 1 });
    expect(duties.duties().map((d) => [d.id, d.statusLabel])).toEqual([
      ['d-earlier', 'Deadline pending'],
    ]);
  });

  it('prefers the member’s unfinished duty in the round', () => {
    const { duties, data } = setup();
    expect(duties.myDuty()?.id).toBe('d-mine');
    data.duties.update((all) => all.filter((d) => d.id !== 'd-mine'));
    expect(duties.myDuty()?.id).toBe('d-done');
    data.currentMemberId.set(null);
    expect(duties.myDuty()).toBeUndefined();
  });

  it('lists pending evidence for review and counts all but the captain’s own', () => {
    const { duties } = setup();
    expect(duties.reviews().map((r) => [r.duty.id, r.evidence.id, r.selfReview])).toEqual([
      ['d-mine', 'e-mine', true],
      ['d-other', 'e-1', false],
    ]);
    expect(duties.reviewCount()).toBe(1);
  });

  it('asks the league for a playback URL', async () => {
    const { duties, data } = setup();
    await expect(duties.playbackUrl('asset-1')).resolves.toBe('https://storage.test/video');
    expect(data.playbackUrl).toHaveBeenCalledWith('asset-1');
  });
});
