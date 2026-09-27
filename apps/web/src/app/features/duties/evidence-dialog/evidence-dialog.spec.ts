import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertService } from '../../../core/feedback/alert.service';
import { LeagueData } from '../../../core/league/league-data';
import { RoundDutyView, RoundViewService } from '../../../core/league/round-view.service';
import { EvidenceDialog } from './evidence-dialog';

const DUTY = {
  id: 'duty-1',
  memberId: 'member-johan',
  memberName: 'Johan',
  title: 'Round 02 Spoon duty',
  status: 'open',
  mine: false,
  spoon: true,
} as RoundDutyView;

describe('EvidenceDialog', () => {
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

  function setup(duty: RoundDutyView = DUTY) {
    const submitted: unknown[] = [];
    let refusal: Error | null = null;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LeagueData,
          useValue: {
            submitEvidence: (body: unknown) => {
              submitted.push(body);
              return refusal ? Promise.reject(refusal) : Promise.resolve();
            },
          },
        },
        {
          provide: RoundViewService,
          useValue: { round: signal({ code: '02' }), administers: signal(true), sample: false },
        },
      ],
    });
    const fixture = TestBed.createComponent(EvidenceDialog);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const alerts = TestBed.inject(AlertService);
    const warn = vi.spyOn(alerts, 'warn');
    const error = vi.spyOn(alerts, 'error');
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const fileInput = () => root.querySelector<HTMLInputElement>('input[type="file"]')!;
    const choose = async (file: File) => {
      Object.defineProperty(fileInput(), 'files', { value: [file], configurable: true });
      fileInput().dispatchEvent(new Event('change'));
      await settle();
    };
    const completed = () => root.querySelector<HTMLInputElement>('#evidence-completed')!;
    const complete = async (value: string) => {
      completed().value = value;
      completed().dispatchEvent(new Event('input'));
      await settle();
    };
    const submit = async () => {
      await fixture.componentInstance.submit();
      await settle();
    };
    fixture.componentInstance.open(duty);
    const refuse = (next: Error | null) => (refusal = next);
    return {
      fixture,
      root,
      alerts,
      warn,
      error,
      submitted,
      settle,
      fileInput,
      choose,
      completed,
      complete,
      submit,
      refuse,
    };
  }

  const video = () => new File(['demo'], 'proof.mp4', { type: 'video/mp4' });

  it('warns about a file that is not a video, marking and focusing the picker', async () => {
    const { root, settle, choose, fileInput, warn } = setup({ ...DUTY, mine: true });
    await settle();
    await choose(new File(['x'], 'note.txt', { type: 'text/plain' }));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Choose a video file to continue.', { key: 'evidence' });
    expect(fileInput().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(fileInput());
    expect(root.querySelector('[role="alert"], .error-message')).toBeNull();
    // No file, no submit.
    expect(root.querySelector<HTMLButtonElement>('button.primary-button')!.disabled).toBe(true);

    // A video answers the warning.
    await choose(video());
    expect(fileInput().getAttribute('aria-invalid')).toBe('false');
    expect(TestBed.inject(AlertService).alerts()).toEqual([]);
  });

  it('warns about a video over 50 MB', async () => {
    const { settle, choose, warn } = setup({ ...DUTY, mine: true });
    await settle();
    const big = video();
    Object.defineProperty(big, 'size', { value: 51 * 1024 * 1024 });
    await choose(big);
    expect(warn).toHaveBeenCalledWith('Choose a video smaller than 50 MB.', { key: 'evidence' });
  });

  it('warns when the completion time is missing or in the future, then records', async () => {
    const { settle, choose, completed, complete, submit, warn, alerts, submitted } = setup();
    await settle();
    await choose(video());
    await submit();
    expect(submitted).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Record when the duty was completed.', { key: 'evidence' });
    expect(completed().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(completed());

    await complete('2099-01-01T09:00');
    expect(completed().getAttribute('aria-invalid')).toBe('false');
    await submit();
    expect(warn).toHaveBeenLastCalledWith('The completion time cannot be in the future.', {
      key: 'evidence',
    });
    expect(alerts.alerts()).toHaveLength(1);

    await complete('2026-09-20T09:00');
    await submit();
    expect(submitted).toHaveLength(1);
    expect(alerts.alerts().map((a) => [a.severity, a.message])).toEqual([
      ['success', "Evidence recorded for Johan. Accept it from the captain's desk."],
    ]);
  });

  it('shows a failed upload as an error card that stays after the dialog closes', async () => {
    const { fixture, settle, choose, submit, error, alerts, refuse } = setup({
      ...DUTY,
      mine: true,
    });
    refuse(new Error('The upload did not finish.'));
    await settle();
    await choose(new File(['x'], 'note.txt', { type: 'text/plain' }));
    await choose(video());
    await submit();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('The upload did not finish.', { key: 'evidence-failed' });
    fixture.componentInstance.close();
    await settle();
    expect(alerts.alerts().map((a) => a.severity)).toEqual(['error']);
  });
});
