import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertService } from '../../../core/feedback/alert.service';
import { CaseControlService } from '../../../core/league/cases/case-control.service';
import { CaseService } from '../../../core/league/cases/case.service';
import { CaseView } from '../../../core/league/cases/case.models';
import { DutyService } from '../../../core/league/duties/duty.service';
import { LeagueContext } from '../../../core/league/league-context';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';
import { CaseCard } from './case-card';

const OPEN: CaseView = {
  id: 'case-1',
  dutyId: 'duty-1',
  linkId: 'link-1',
  submissionId: 'sub-1',
  assetId: 'asset-1',
  roundNumber: 2,
  dutyType: 'spoon',
  dutyTitle: 'Round 02 Spoon duty',
  subjectId: 'member-jp',
  subjectName: 'Johan',
  submitterName: 'Johan',
  submittedAt: '2026-10-04T08:00:00Z',
  note: 'Done at the braai.',
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
  mine: false,
  spoon: true,
  live: true,
  statusLabel: 'VOTING OPEN',
  outcome: null,
  closes: '05 Oct 2026 · 10:00 SAST',
};

describe('CaseCard', () => {
  function setup(view: CaseView, sample = false) {
    const control = {
      accept: vi.fn().mockResolvedValue(undefined),
      veto: vi.fn().mockResolvedValue(undefined),
      review: vi.fn().mockResolvedValue(undefined),
    };
    const playbackUrl = vi.fn().mockRejectedValue(new Error('The video is unavailable.'));
    TestBed.configureTestingModule({
      providers: [
        { provide: LeagueContext, useValue: { name: signal('Piele') } },
        { provide: CaseControlService, useValue: control },
        { provide: CaseService, useValue: { countdown: () => '5 h 0 min left' } },
        { provide: DutyService, useValue: { playbackUrl } },
      ],
    });
    const dialog = TestBed.createComponent(ReasonDialog);
    dialog.detectChanges();
    const fixture = TestBed.createComponent(CaseCard);
    fixture.componentRef.setInput('evidenceCase', view);
    fixture.componentRef.setInput('reasonDialog', dialog.componentInstance);
    fixture.componentRef.setInput('sample', sample);
    fixture.componentRef.setInput('roundCode', '02');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const alerts = TestBed.inject(AlertService);
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
      dialog.detectChanges();
    };
    const button = (name: string) =>
      Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === name);
    const overlay = () => document.body.querySelector('[role=dialog]');
    const giveReason = async (reason: string) => {
      const text = document.body.querySelector<HTMLTextAreaElement>('#reason-text')!;
      text.value = reason;
      text.dispatchEvent(new Event('input'));
      await settle();
      document.body
        .querySelector<HTMLButtonElement>('[role=dialog] button.primary-button')!
        .click();
      await settle();
    };
    return { fixture, root, control, alerts, settle, button, overlay, giveReason, playbackUrl };
  }

  it('shows the countdown and participation, never who voted, and accepts', async () => {
    const { root, control, alerts, button, settle } = setup(OPEN);
    expect(root.textContent).toContain('VOTING OPEN');
    expect(root.textContent).toContain('ROUND 02 / Johan');
    expect(root.textContent).toContain('5 h 0 min left');
    expect(root.textContent).toContain('1 of 5 members responded');
    expect(root.textContent).toContain('Not yet');
    expect(root.textContent).toContain('Accepted once 3 of 5 members accept');
    const success = vi.spyOn(alerts, 'success');
    button('Accept')!.click();
    await settle();
    expect(control.accept).toHaveBeenCalledWith('case-1');
    expect(success).toHaveBeenCalledOnce();
  });

  it('vetoes only with a reason, through the reason dialog', async () => {
    const { control, button, overlay, giveReason, settle } = setup({
      ...OPEN,
      myResponse: 'accept',
    });
    // An accept can still become a veto, so Accept gives way to Veto alone.
    expect(button('Accept')).toBeUndefined();
    button('Veto')!.click();
    await settle();
    expect(overlay()?.textContent).toContain('Veto this evidence?');
    expect(overlay()?.textContent).toContain('PIELE / ROUND 02 DECISION');
    await giveReason('');
    expect(control.veto).not.toHaveBeenCalled();
    await giveReason('Wrong round on the video.');
    expect(control.veto).toHaveBeenCalledWith('case-1', 'Wrong round on the video.');
  });

  it('shows the permitted reviewer the veto reason and rules on it', async () => {
    const { root, control, button, overlay, giveReason, settle } = setup({
      ...OPEN,
      status: 'in_review',
      statusLabel: 'IN REVIEW',
      canRespond: false,
      canReview: true,
      vetoReason: 'Wrong round on the video.',
    });
    expect(root.textContent).toContain('Veto: “Wrong round on the video.”');
    expect(button('Veto')).toBeUndefined();
    button('Dismiss veto')!.click();
    await settle();
    expect(overlay()?.textContent).toContain('Voting reopens until 05 Oct 2026 · 10:00 SAST');
    await giveReason('Round 02 is visible at 0:40.');
    expect(control.review).toHaveBeenCalledWith(
      'case-1',
      'dismissed',
      'Round 02 is visible at 0:40.',
    );
  });

  it('flags a veto nobody in the league may rule on, and states a closed outcome', () => {
    const flagged = setup({
      ...OPEN,
      status: 'in_review',
      canRespond: false,
      needsReviewer: true,
    });
    expect(flagged.root.textContent).toContain('NEEDS AN UNINVOLVED REVIEWER');
    expect(flagged.button('Uphold veto')).toBeUndefined();
    flagged.fixture.componentRef.setInput('evidenceCase', {
      ...OPEN,
      status: 'accepted',
      resolution: 'majority',
      resolvedAt: '2026-10-04T12:00:00Z',
      canRespond: false,
      myResponse: 'accept',
      live: false,
      outcome: 'Accepted by a majority of members',
    });
    flagged.fixture.detectChanges();
    expect(flagged.root.textContent).toContain('Accepted by a majority of members');
    expect(flagged.root.textContent).toContain('You accepted');
    expect(flagged.root.classList).toContain('closed-case');
  });

  it('offers the video except for sample evidence, and shows a failed link as an error card', async () => {
    const sample = setup(OPEN, true);
    expect(sample.button('Watch video')).toBeUndefined();
    sample.fixture.componentRef.setInput('sample', false);
    sample.fixture.detectChanges();
    const error = vi.spyOn(sample.alerts, 'error');
    const tab = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    sample.button('Watch video')!.click();
    await sample.settle();
    expect(sample.playbackUrl).toHaveBeenCalledWith('asset-1');
    expect(error).toHaveBeenCalledWith('The video is unavailable.', { key: 'playback-asset-1' });
    expect(tab.close).toHaveBeenCalled();
  });
});
