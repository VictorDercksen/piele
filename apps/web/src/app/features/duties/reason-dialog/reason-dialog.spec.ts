import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertService } from '../../../core/feedback/alert.service';
import { LeagueContext } from '../../../core/league/league-context';
import { ReasonDialog, ReasonRequest } from './reason-dialog';

describe('ReasonDialog', () => {
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

  function setup() {
    TestBed.configureTestingModule({
      providers: [{ provide: LeagueContext, useValue: { name: signal('Piele') } }],
    });
    const fixture = TestBed.createComponent(ReasonDialog);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const alerts = TestBed.inject(AlertService);
    const warn = vi.spyOn(alerts, 'warn');
    const error = vi.spyOn(alerts, 'error');
    const reasons: string[] = [];
    let refusal: Error | null = null;
    const request: ReasonRequest = {
      title: 'Void this duty?',
      description: 'The duty leaves the register.',
      submitLabel: 'Void duty',
      required: true,
      action: (reason) => {
        reasons.push(reason);
        return refusal ? Promise.reject(refusal) : Promise.resolve();
      },
    };
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const textarea = () => root.querySelector<HTMLTextAreaElement>('#reason-text')!;
    const type = async (value: string) => {
      textarea().value = value;
      textarea().dispatchEvent(new Event('input'));
      await settle();
    };
    const submit = async () => {
      root.querySelector<HTMLButtonElement>('button.primary-button')!.click();
      await settle();
    };
    const dialog = () => root.querySelector('dialog')!;
    const refuse = (next: Error | null) => (refusal = next);
    return {
      fixture,
      root,
      alerts,
      warn,
      error,
      reasons,
      request,
      settle,
      textarea,
      type,
      submit,
      dialog,
      refuse,
    };
  }

  it('warns when the reason is missing, marking and focusing the field', async () => {
    const { fixture, root, request, settle, submit, textarea, type, warn, reasons } = setup();
    fixture.componentInstance.open(request);
    await settle();
    expect(textarea().getAttribute('aria-invalid')).toBe('false');
    await submit();
    expect(reasons).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Give a reason so the register explains itself.', {
      key: 'reason',
    });
    expect(textarea().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(textarea());
    expect(root.querySelector('[role="alert"], .error-message')).toBeNull();

    // A second empty attempt replaces the card; typing clears the mark.
    await submit();
    expect(TestBed.inject(AlertService).alerts()).toHaveLength(1);
    await type('Created by mistake');
    expect(textarea().getAttribute('aria-invalid')).toBe('false');
  });

  it('drops the warning when a valid submit starts, then closes', async () => {
    const { fixture, request, settle, submit, type, alerts, reasons, dialog } = setup();
    fixture.componentInstance.open(request);
    await settle();
    await submit();
    expect(alerts.alerts().map((a) => a.severity)).toEqual(['warning']);
    await type('  Created by mistake ');
    await submit();
    expect(reasons).toEqual(['Created by mistake']);
    expect(alerts.alerts()).toEqual([]);
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  it("shows the action's failure as an error card that outlives the dialog", async () => {
    const { fixture, request, settle, submit, type, alerts, error, refuse, dialog } = setup();
    refuse(new Error('The duty could not be voided.'));
    fixture.componentInstance.open(request);
    await settle();
    await type('Created by mistake');
    await submit();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('The duty could not be voided.', { key: 'reason-failed' });
    expect(dialog().hasAttribute('open')).toBe(true);

    // A later empty attempt adds a warning; closing takes only the warning away.
    await type('');
    await submit();
    expect(alerts.alerts().map((a) => a.severity)).toEqual(['error', 'warning']);
    fixture.componentInstance.close();
    await settle();
    expect(alerts.alerts().map((a) => [a.severity, a.message])).toEqual([
      ['error', 'The duty could not be voided.'],
    ]);

    // Opened again for another go, a success clears the stale failure.
    refuse(null);
    fixture.componentInstance.open(request);
    await settle();
    await type('Created by mistake');
    await submit();
    expect(alerts.alerts()).toEqual([]);
  });

  it('asks for nothing in a plain confirmation', async () => {
    const { fixture, request, settle, submit, warn, reasons, root } = setup();
    fixture.componentInstance.open({ ...request, required: false, noReason: true });
    await settle();
    expect(root.querySelector('textarea')).toBeNull();
    await submit();
    expect(warn).not.toHaveBeenCalled();
    expect(reasons).toEqual(['']);
  });
});
