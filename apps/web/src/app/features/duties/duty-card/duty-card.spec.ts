import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertService } from '../../../core/feedback/alert.service';
import { LeagueContext } from '../../../core/league/league-context';
import { LeagueData } from '../../../core/league/league-data';
import { DutyEvidence } from '../../../core/league/league.models';
import { RoundDutyView } from '../../../core/league/round-view.service';
import { DutyCard } from './duty-card';

const EVIDENCE = {
  id: 'evidence-1',
  submissionId: 'submission-1',
  assetId: 'asset-1',
  decision: 'pending',
  submittedAt: '2026-09-20T07:00:00Z',
  claimedCompletedAt: null,
  decidedAt: null,
  reason: null,
  effectiveCompletedAt: null,
  note: '',
  submitterId: 'member-johan',
  submitterName: 'Johan',
} as DutyEvidence;

const DUTY = {
  id: 'duty-1',
  memberId: 'member-johan',
  memberName: 'Johan',
  roundId: 2,
  type: 'spoon',
  title: 'Round 02 Spoon duty',
  reason: 'Last place.',
  deadlineAt: null,
  status: 'open',
  display: 'open',
  completedAt: null,
  clockResetAt: null,
  voidReason: null,
  createdAt: '2026-09-19T07:00:00Z',
  marks: {
    marks: 0,
    overdueHours: 0,
    asOf: '2026-09-20T07:00:00Z',
    nextMarkAt: null,
    explanation: '',
  },
  evidence: [EVIDENCE],
  pickFixtureIds: [],
  mine: false,
  spoon: true,
  statusLabel: 'Under review',
} as unknown as RoundDutyView;

describe('DutyCard', () => {
  it('shows a failed playback link as an error card, not inline', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LeagueContext, useValue: { url: (path = '') => `/piele${path}` } },
        {
          provide: LeagueData,
          useValue: { playbackUrl: () => Promise.reject(new Error('The video is unavailable.')) },
        },
      ],
    });
    const fixture = TestBed.createComponent(DutyCard);
    fixture.componentRef.setInput('duty', DUTY);
    fixture.detectChanges();
    const alerts = TestBed.inject(AlertService);
    const error = vi.spyOn(alerts, 'error');
    const root = fixture.nativeElement as HTMLElement;
    const watch = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Watch video'),
    )!;
    watch.click();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('The video is unavailable.', { key: 'playback-asset-1' });
    expect(root.querySelector('[role="alert"], .error-message')).toBeNull();
  });
});
