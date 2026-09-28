import { By } from '@angular/platform-browser';
import { SearchSelect } from '../../../shared/search-select/search-select';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertService } from '../../../core/feedback/alert.service';
import { ApiError } from '../../../core/api/api-error';
import { LeagueMember, LeagueRules } from '../../../core/league/league.models';
import { RoundViewService } from '../../../core/league/round-view.service';
import { DEFAULT_RULES } from '../../../core/league/superbru';
import { RulesCard } from './rules-card';

async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
  TestBed.tick();
}

const MEMBERS: LeagueMember[] = [
  {
    id: 'm-annas',
    name: 'Annas',
    fullName: 'Annas',
    initials: 'AN',
    teamId: '',
    claimed: true,
    inSeason: true,
  },
  {
    id: 'm-deon',
    name: 'Deon',
    fullName: 'Deon',
    initials: 'DE',
    teamId: '',
    claimed: true,
    inSeason: true,
  },
];

describe('RulesCard', () => {
  afterEach(() => TestBed.inject(AlertService).clear());

  function setup(refusal: ApiError | null = null) {
    const rules = signal<LeagueRules>({ ...DEFAULT_RULES, previousChampionMemberId: 'm-annas' });
    const saved: Partial<LeagueRules>[] = [];
    const view = {
      rules: rules.asReadonly(),
      members: signal(MEMBERS).asReadonly(),
      withdrawn: signal([]).asReadonly(),
      saveRules: (change: Partial<LeagueRules>) => {
        saved.push(change);
        if (refusal) return Promise.reject(refusal);
        rules.update((r) => ({ ...r, ...change }));
        return Promise.resolve();
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: RoundViewService, useValue: view }] });
    const fixture = TestBed.createComponent(RulesCard);
    const alerts = TestBed.inject(AlertService);
    const warn = vi.spyOn(alerts, 'warn');
    const error = vi.spyOn(alerts, 'error');
    const root = fixture.nativeElement as HTMLElement;
    const field = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#rules-${id}`)!;
    const type = (id: string, value: string) => {
      const input = field<HTMLInputElement>(id);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
    };
    return { fixture, root, field, type, submit, saved, rules, alerts, warn, error };
  }

  it('shows the saved rules, with the champion among the members', async () => {
    const { field, root, fixture } = setup();
    await settle();
    expect(field<HTMLElement>('bonusPoint').getAttribute('aria-checked') === 'true').toBe(true);
    expect(field<HTMLInputElement>('startingRound').value).toBe('1');
    expect(field<HTMLInputElement>('win-final').value).toBe('3');
    const champion = fixture.debugElement.query(By.directive(SearchSelect))
      .componentInstance as SearchSelect;
    expect(champion.allOptions().map((option) => option.label)).toEqual(['None', 'Annas', 'Deon']);
    expect(champion.value()).toBe('m-annas');
    expect(root.textContent).toContain(
      "These mirror the pool's settings on Superbru and drive the scoring in the clubhouse.",
    );
  });

  it('sends only the rules that changed', async () => {
    const { field, type, submit, saved, fixture } = setup();
    await settle();
    field<HTMLInputElement>('bonusPointSplit').click();
    type('marginWindow', '7');
    type('win-semiFinal', '2.5');
    const champion = fixture.debugElement.query(By.directive(SearchSelect))
      .componentInstance as SearchSelect;
    champion.choose('');
    await submit();
    expect(saved).toEqual([
      {
        bonusPointSplit: false,
        winPoints: { regular: 1, quarterFinal: 1.5, semiFinal: 2.5, final: 3 },
        marginWindow: 7,
        previousChampionMemberId: null,
      },
    ]);
  });

  it('sends nothing when nothing changed', async () => {
    const { submit, saved } = setup();
    await settle();
    await submit();
    expect(saved).toEqual([]);
  });

  it('keeps unsaved edits when the same rules arrive as a new object', async () => {
    const { field, type, rules } = setup();
    await settle();
    type('marginWindow', '7');
    await settle();
    rules.set({ ...rules(), winPoints: { ...rules().winPoints } });
    await settle();
    expect(field<HTMLInputElement>('marginWindow').value).toBe('7');
    rules.set({ ...rules(), grandSlamPoints: 4 });
    await settle();
    expect(field<HTMLInputElement>('marginWindow').value).toBe('5');
    expect(field<HTMLInputElement>('grandSlamPoints').value).toBe('4');
  });

  it('drops Undo changes once an unchanged save finds nothing to send', async () => {
    const { type, submit, saved, root } = setup();
    await settle();
    const undo = () =>
      Array.from(root.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Undo changes'),
      );
    type('marginWindow', '7');
    await settle();
    expect(undo()).toBe(true);
    type('marginWindow', String(DEFAULT_RULES.marginWindow));
    await submit();
    expect(saved).toEqual([]);
    expect(undo()).toBe(false);
  });

  it('refuses a negative number or a starting round outside the competition', async () => {
    const { field, type, submit, saved, root, warn } = setup();
    await settle();
    type('bonusRange', '-1');
    type('startingRound', '40');
    await submit();
    expect(saved).toEqual([]);
    expect(field('bonusRange').getAttribute('aria-invalid')).toBe('true');
    expect(field('startingRound').getAttribute('aria-invalid')).toBe('true');
    expect(field('startingRound').hasAttribute('aria-describedby')).toBe(false);
    // One warning for the attempt, the first problem as its message, the rest as details.
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Starting round: choose a round from 1 to 18.', {
      key: 'captain-rules',
      details: ['Bonus range: enter a number from 0 to 1000.'],
    });
    expect(root.querySelector('.field-error, [role="alert"]')).toBeNull();
    expect(field('startingRound').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('startingRound'));
  });

  it('replaces the warning on a resubmit and drops it once the rules are valid', async () => {
    const { type, submit, saved, alerts, warn } = setup();
    await settle();
    type('bonusRange', '-1');
    await submit();
    await submit();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(alerts.alerts().filter((a) => a.key === 'captain-rules')).toHaveLength(1);
    type('bonusRange', '4');
    await submit();
    expect(saved).toEqual([{ bonusRange: 4 }]);
    expect(alerts.alerts().map((a) => [a.severity, a.message])).toEqual([
      ['success', 'Superbru rules saved.'],
    ]);
  });

  it('shows a refusal by its code as an error card', async () => {
    const { type, submit, root, error } = setup(
      new ApiError(404, 'unknown_member', 'Unknown member.'),
    );
    await settle();
    type('grandSlamPoints', '3');
    await submit();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      "The previous season's champion must be a member of this league.",
      { key: 'captain-rules' },
    );
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });
});
