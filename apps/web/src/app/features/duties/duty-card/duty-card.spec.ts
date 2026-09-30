import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertService } from '../../../core/feedback/alert.service';
import { RoundDutyView } from '../../../core/league/duties/duty.models';
import { DutyService } from '../../../core/league/duties/duty.service';
import { LeagueContext } from '../../../core/league/league-context';
import { DutyEvidence, EvidenceCaseSummary } from '../../../core/league/league.models';
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
  evidenceCase: null,
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
          provide: DutyService,
          useValue: { playbackUrl: () => Promise.reject(new Error('The video is unavailable.')) },
        },
      ],
    });
    const fixture = TestBed.createComponent(DutyCard);
    fixture.componentRef.setInput('duty', DUTY);
    fixture.detectChanges();
    const alerts = TestBed.inject(AlertService);
    const error = vi.spyOn(alerts, 'error');
    const tab = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const root = fixture.nativeElement as HTMLElement;
    const watch = root.querySelector<HTMLButtonElement>(
      'button[aria-label="Watch video from Johan"]',
    )!;
    watch.click();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('The video is unavailable.', { key: 'playback-asset-1' });
    expect(root.querySelector('[role="alert"], .error-message')).toBeNull();
    expect(tab.close).toHaveBeenCalledOnce();
  });
  it('shows where the evidence’s vote stands and links to it while live', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LeagueContext, useValue: { url: (path = '') => `/piele${path}` } },
        { provide: DutyService, useValue: {} },
      ],
    });
    const open: EvidenceCaseSummary = {
      id: 'case-1',
      status: 'open',
      resolution: null,
      closesAt: '2026-09-21T07:00:00Z',
      resolvedAt: null,
    };
    const fixture = TestBed.createComponent(DutyCard);
    const root = fixture.nativeElement as HTMLElement;
    const show = (evidenceCase: EvidenceCaseSummary, live: boolean) => {
      fixture.componentRef.setInput('duty', {
        ...DUTY,
        display: live ? 'under_review' : 'completed',
        status: live ? 'open' : 'completed',
        completedAt: live ? null : '2026-09-20T07:00:00Z',
        evidence: [{ ...EVIDENCE, decision: live ? 'pending' : 'accepted', evidenceCase }],
        liveCase: live ? evidenceCase : null,
      });
      fixture.detectChanges();
    };
    show(open, true);
    // The lead panel carries the live vote's close time; the evidence line does not repeat it.
    expect(root.querySelector('.duty-step')?.textContent).toContain(
      'Members are voting on the evidence',
    );
    expect(root.querySelector('.duty-step')?.textContent).toContain('Vote closes 21 Sep · 09:00');
    expect(root.textContent).not.toContain('Voting open until');
    expect(root.querySelector('a[href="/piele/decisions"]')?.textContent).toContain(
      'View the vote',
    );
    show({ ...open, status: 'in_review' }, true);
    expect(root.querySelector('.duty-step')?.textContent).toContain(
      'Vetoed: an uninvolved reviewer will rule',
    );
    expect(root.textContent).toContain('View the veto');
    show({ ...open, status: 'accepted', resolution: 'auto' }, false);
    expect(root.querySelector('.duty-step')?.textContent).toContain('Completed');
    expect(root.querySelector('.duty-step .date-chip')?.textContent?.trim()).toBe('20 Sep · 09:00');
    expect(root.querySelector('.duty-step')?.textContent).not.toContain('Accepted');
    expect(root.textContent).toContain('Accepted automatically: no veto within 24 hours');
    expect(root.querySelector('a[href="/piele/decisions"]')).toBeNull();
  });
});
