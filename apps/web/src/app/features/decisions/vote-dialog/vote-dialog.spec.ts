import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertService } from '../../../core/feedback/alert.service';
import { Poll } from '../../../core/league/league.models';
import { RoundViewService } from '../../../core/league/round-view.service';
import { VoteDialog } from './vote-dialog';

const POLL: Poll = {
  id: 'poll-1',
  roundId: 2,
  question: 'Where do we braai?',
  description: 'The round 02 venue.',
  options: ['Pofadder', 'Stellenbosch'],
  closes: 'Fri 20:00',
  status: 'Open',
  participants: 0,
  eligible: 12,
};

describe('VoteDialog', () => {
  beforeAll(() => {
    // jsdom has no modal dialogs.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('shows a failed vote as an error card and clears it once the vote is recorded', async () => {
    let refusal: Error | null = new Error('Voting closed for this poll.');
    const votes: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RoundViewService,
          useValue: {
            leagueName: signal('Piele'),
            round: signal({ code: '02' }),
            sample: false,
            castVote: (_id: string, choice: string) => {
              votes.push(choice);
              return refusal ? Promise.reject(refusal) : Promise.resolve();
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(VoteDialog);
    fixture.detectChanges();
    const alerts = TestBed.inject(AlertService);
    const error = vi.spyOn(alerts, 'error');
    const root = fixture.nativeElement as HTMLElement;
    const dialog = fixture.componentInstance;
    dialog.open(POLL);
    dialog.choice.setValue('Pofadder');
    await dialog.submit();
    await fixture.whenStable();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('Voting closed for this poll.', { key: 'vote-failed' });
    expect(root.querySelector('dialog')!.hasAttribute('open')).toBe(true);
    expect(root.querySelector('[role="alert"], .error-message')).toBeNull();

    refusal = null;
    await dialog.submit();
    await fixture.whenStable();
    expect(votes).toEqual(['Pofadder', 'Pofadder']);
    expect(alerts.alerts().map((a) => a.severity)).toEqual(['success']);
  });
});
