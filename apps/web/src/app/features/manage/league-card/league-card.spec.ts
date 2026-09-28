import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertService } from '../../../core/feedback/alert.service';
import { AdminLeague, CompetitionOption, LeagueUpdate } from '../../../core/league/admin/admin.models';
import { AdminLeagueControlService } from '../../../core/league/admin/admin-league-control.service';
import { AdminLeagueService } from '../../../core/league/admin/admin-league.service';
import { DEFAULT_RULES } from '../../../core/league/superbru';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';
import { LeagueCard } from './league-card';

async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
  TestBed.tick();
}

/** A competition the web registry does not know, with ten regular rounds. */
const SHORT: CompetitionOption = {
  id: 'short-cup-2027',
  name: 'Short Cup 2027',
  shortName: 'SC',
  timezone: 'Africa/Johannesburg',
  regularRounds: 10,
  lastRound: 12,
};

const LEAGUE: AdminLeague = {
  id: 'l-1',
  slug: 'short',
  name: 'Short League',
  timezone: 'Africa/Johannesburg',
  status: 'active',
  emblemPreset: null,
  emblemUrl: null,
  accentColour: null,
  joinCode: null,
  competition: { id: SHORT.id, name: SHORT.name, shortName: SHORT.shortName },
  season: { id: 's-1', name: 'SC 2027', status: 'active' },
  captain: null,
  counts: { members: 1, claimed: 1, inSeason: 1, withdrawn: 0 },
  myMemberId: 'm-1',
  createdAt: '2026-09-01T00:00:00Z',
  rules: { ...DEFAULT_RULES, startingRound: 2 },
};

describe('LeagueCard', () => {
  function setup(league: AdminLeague = LEAGUE) {
    let resolveList: (list: readonly CompetitionOption[]) => void = () => undefined;
    const list = new Promise<readonly CompetitionOption[]>((resolve) => (resolveList = resolve));
    const updates: LeagueUpdate[] = [];
    let refusal: Error | null = null;
    const admin = {
      competitions: () => list,
      update: (_id: string, patch: LeagueUpdate) => {
        updates.push(patch);
        return refusal ? Promise.reject(refusal) : Promise.resolve(league);
      },
      addMe: () => (refusal ? Promise.reject(refusal) : Promise.resolve()),
      captainCandidates: () =>
        Promise.resolve([
          { id: 'm-1', displayName: 'You' },
          { id: 'm-2', displayName: 'Kallie' },
        ]),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdminLeagueService, useValue: admin },
        { provide: AdminLeagueControlService, useValue: admin },
      ],
    });
    const alerts = TestBed.inject(AlertService);
    const warn = vi.spyOn(alerts, 'warn');
    const error = vi.spyOn(alerts, 'error');
    const fixture = TestBed.createComponent(LeagueCard);
    fixture.componentRef.setInput('league', league);
    fixture.componentRef.setInput('dialog', {} as ReasonDialog);
    const card = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    const field = <T extends HTMLElement>(id: string) =>
      root.querySelector<T>(`#league-l-1-${id}`)!;
    const startingRound = card.renameForm.controls.rules.controls.startingRound;
    const fail = (message: string) => (refusal = new Error(message));
    return { card, root, field, startingRound, resolveList, updates, warn, error, fail };
  }

  afterEach(() => TestBed.inject(AlertService).clear());

  it("bounds the starting round by the competition's regular rounds from the admin list", async () => {
    const { card, startingRound, resolveList, updates } = setup();
    card.expanded.set(true);
    card.startRename();
    await settle();
    // Until the list arrives the bound is the saved starting round: never looser.
    expect(card.lastRound()).toBe(2);
    expect(startingRound.valid).toBe(true);
    startingRound.setValue(3);
    expect(startingRound.valid).toBe(false);

    resolveList([SHORT]);
    await settle();
    expect(card.lastRound()).toBe(10);
    expect(startingRound.valid).toBe(true);
    startingRound.setValue(11);
    expect(startingRound.valid).toBe(false);
    startingRound.setValue(10);
    await card.saveRename();
    expect(updates).toEqual([{ rules: { startingRound: 10 } }]);
  });

  it('warns once about a blank name and a rule to fix, and highlights the name', async () => {
    const { card, field, startingRound, updates, warn } = setup();
    card.expanded.set(true);
    card.startRename();
    await settle();
    card.renameForm.controls.name.setValue(' ');
    startingRound.setValue(3);
    // Opening the form put the cursor in the name; the warning must not bring it back.
    field('rename-name').blur();
    await card.saveRename();
    await settle();
    expect(updates).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Give the league a name.', {
      key: 'league-l-1-rename',
      details: ['Starting round: choose a round from 1 to 2.'],
    });
    expect(field('rename-name').getAttribute('aria-invalid')).toBe('true');
    expect(field('rename-name').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('rename-name'));
    // The rules group opens so the marked rule shows.
    expect(field<HTMLElement>('rules').getAttribute('data-state') === 'open').toBe(true);
    expect(field('rules-startingRound').getAttribute('aria-invalid')).toBe('true');
  });

  it('highlights the first rule to fix when only the rules are wrong', async () => {
    const { card, field, startingRound, warn } = setup();
    card.expanded.set(true);
    card.startRename();
    await settle();
    startingRound.setValue(0);
    card.renameForm.controls.rules.controls.marginPoint.setValue(-1);
    await card.saveRename();
    await settle();
    expect(warn).toHaveBeenCalledWith('Starting round: choose a round from 1 to 2.', {
      key: 'league-l-1-rename',
      details: ['Margin point: enter a number from 0 to 1000.'],
    });
    expect(field('rules-startingRound').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('rules-startingRound'));
  });

  it('shows a refused save and a refused "Add me" as errors', async () => {
    const { card, error, fail } = setup({ ...LEAGUE, myMemberId: null });
    card.expanded.set(true);
    fail('The API is not answering.');
    await card.addMe();
    expect(error).toHaveBeenCalledWith('The API is not answering.', { key: 'league-l-1-error' });

    card.startRename();
    await settle();
    card.renameForm.controls.name.setValue('Short Cup League');
    fail('Only the admin may rename a league.');
    await card.saveRename();
    expect(error).toHaveBeenLastCalledWith('Only the admin may rename a league.', {
      key: 'league-l-1-error',
    });
  });

  it('gives the link in an error when the browser refuses to copy it', async () => {
    const { card, error } = setup({ ...LEAGUE, joinCode: 'abc123' });
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    try {
      await card.copyLink();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(error).toHaveBeenCalledWith(
      `This browser did not allow copying. The link is ${location.origin}/join/abc123`,
      { key: 'league-l-1-copy' },
    );
    expect(card.copied()).toBe(false);
  });

  it('warns and highlights the select when no captain is chosen', async () => {
    const { card, root, field, warn } = setup();
    card.expanded.set(true);
    await settle();
    const panel = root.querySelector<HTMLDetailsElement>('.captain-panel')!;
    panel.querySelector<HTMLButtonElement>('.disclosure-trigger')!.click();
    await settle();
    root.querySelector<HTMLButtonElement>('.captain-field .primary-button')!.click();
    await settle();
    expect(warn).toHaveBeenCalledWith('Choose who takes over.', {
      key: 'league-l-1-captain',
      details: [],
    });
    expect(field('captain').getAttribute('aria-invalid')).toBe('true');
    expect(field('captain').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('captain'));
  });
});
