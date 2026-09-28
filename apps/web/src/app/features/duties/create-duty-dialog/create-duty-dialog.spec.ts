import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertService } from '../../../core/feedback/alert.service';
import { LeagueData } from '../../../core/league/league-data';
import { NewDuty } from '../../../core/league/league.models';
import { RoundViewService } from '../../../core/league/round-view.service';
import { CreateDutyDialog } from './create-duty-dialog';

describe('CreateDutyDialog', () => {
  function setup() {
    const created: NewDuty[] = [];
    let refusal: Error | null = null;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LeagueData,
          useValue: {
            createDuty: (duty: NewDuty) => {
              created.push(duty);
              return refusal ? Promise.reject(refusal) : Promise.resolve();
            },
          },
        },
        {
          provide: RoundViewService,
          useValue: {
            leagueName: signal('Piele'),
            members: signal([{ id: 'member-johan', name: 'Johan', inSeason: true }]),
            round: signal({ id: 2 }),
            picksFor: () => null,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CreateDutyDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance;
    const root = document.body;
    const alerts = TestBed.inject(AlertService);
    const warn = vi.spyOn(alerts, 'warn');
    const error = vi.spyOn(alerts, 'error');
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const submit = async () => {
      await dialog.submit();
      await settle();
    };
    const member = () =>
      root.querySelector<HTMLButtonElement>(
        'app-search-select[formControlName="memberId"] [role=combobox]',
      )!;
    const deadline = () => root.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
    const refuse = (next: Error | null) => (refusal = next);
    return {
      fixture,
      dialog,
      root,
      alerts,
      warn,
      error,
      created,
      settle,
      submit,
      member,
      deadline,
      refuse,
    };
  }

  it('warns when no member is chosen, marking and highlighting the select', async () => {
    const { dialog, root, settle, submit, member, warn, created } = setup();
    dialog.open();
    await settle();
    expect(member().getAttribute('aria-invalid')).not.toBe('true');
    await submit();
    expect(created).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Choose the member who owes the duty.', {
      key: 'create-duty',
      details: [],
    });
    expect(member().getAttribute('aria-invalid')).toBe('true');
    expect(member().classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(member());
    expect(root.querySelector('[role="alert"], .error-message')).toBeNull();
  });

  it('lists a missing deadline for a pick confirmation as a further problem', async () => {
    const { dialog, settle, submit, member, deadline, warn, alerts } = setup();
    dialog.open({ type: 'pick_confirmation' });
    await settle();
    await submit();
    expect(warn).toHaveBeenCalledWith('Choose the member who owes the duty.', {
      key: 'create-duty',
      details: ['A pick confirmation needs a deadline.'],
    });
    expect(member().getAttribute('aria-invalid')).toBe('true');
    expect(deadline().getAttribute('aria-invalid')).toBe('true');

    dialog.form.controls.memberId.setValue('member-johan');
    await settle();
    expect(member().getAttribute('aria-invalid')).not.toBe('true');
    await submit();
    expect(warn).toHaveBeenLastCalledWith('A pick confirmation needs a deadline.', {
      key: 'create-duty',
      details: [],
    });
    expect(deadline().classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(deadline());
    expect(alerts.alerts()).toHaveLength(1);

    // Closing takes the warning away.
    dialog.close();
    await settle();
    expect(alerts.alerts()).toEqual([]);
  });

  it('shows a failed create as an error card that stays after closing, and emits on success', async () => {
    const { fixture, dialog, settle, submit, error, alerts, created, refuse } = setup();
    const emitted: unknown[] = [];
    fixture.componentInstance.created.subscribe((value) => emitted.push(value));
    refuse(new Error('The league API could not be reached.'));
    dialog.open({ memberId: 'member-johan', reason: 'Last place.' });
    await settle();
    await submit();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('The league API could not be reached.', {
      key: 'create-duty-failed',
    });
    dialog.close();
    await settle();
    expect(alerts.alerts().map((a) => a.severity)).toEqual(['error']);

    refuse(null);
    dialog.open({ memberId: 'member-johan', reason: 'Last place.' });
    await settle();
    await submit();
    expect(created).toHaveLength(2);
    expect(emitted).toHaveLength(1);
    expect(alerts.alerts()).toEqual([]);
  });
});
