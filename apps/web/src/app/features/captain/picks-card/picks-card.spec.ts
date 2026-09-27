import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { competition } from '../../../core/competition/registry';
import {
  FixtureResult,
  LeagueMember,
  StandingEntry,
  StewardPick,
} from '../../../core/league/league.models';
import { RoundViewService } from '../../../core/league/round-view.service';
import { DEFAULT_RULES } from '../../../core/league/superbru';
import { PicksCard } from './picks-card';

const URC = competition('urc-2026-27');
const ROUND = URC.buildRounds(1).find((r) => r.id === 1)!;
const FIXTURE = ROUND.fixtures[0];
const FID = FIXTURE.id;

function member(id: string, name: string): LeagueMember {
  return {
    id,
    name,
    fullName: name,
    initials: name.slice(0, 2).toUpperCase(),
    teamId: '',
    claimed: true,
    inSeason: true,
  };
}

const MEMBERS = [member('a', 'Annas'), member('b', 'Deon'), member('c', 'Pierre')];

interface Row {
  memberId: string;
  side: 'home' | 'away' | 'draw' | 'missed';
  margin: number | null;
  isDefault?: boolean;
  points?: number;
}

async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
  TestBed.tick();
}

function setup(options: { locked?: boolean; result?: FixtureResult | null } = {}) {
  const locked = signal(options.locked ?? true);
  const result = signal<FixtureResult | null>(options.result ?? null);
  const rows = signal<Row[]>([
    { memberId: 'a', side: 'home', margin: 7, points: 1.5 },
    { memberId: 'b', side: 'draw', margin: 0, points: 0 },
  ]);
  const recorded: { fixtureId: string; picks: readonly StewardPick[] }[] = [];
  const removed: string[] = [];
  const standings: { roundId: number; entries: readonly StandingEntry[] }[] = [];
  const view = {
    round: signal(ROUND).asReadonly(),
    fixtures: signal(ROUND.fixtures).asReadonly(),
    members: signal(MEMBERS).asReadonly(),
    withdrawn: signal([]).asReadonly(),
    rules: signal(DEFAULT_RULES).asReadonly(),
    roundBadges: signal({ cap: [], spoon: [] }).asReadonly(),
    derivedVsRecorded: signal(
      MEMBERS.map((m, i) => ({
        memberId: m.id,
        name: m.name,
        you: false,
        photo: null,
        teamId: '',
        rank: i + 1,
        derived: 3 - i,
        recorded: m.id === 'b' ? 4 : null,
        differs: m.id === 'b',
      })),
    ).asReadonly(),
    picksFor: (id: string) => {
      const scoredResult = id === FID ? result() : null;
      const live = !!scoredResult && scoredResult.state !== 'full_time';
      return {
        locked: id === FID ? locked() : false,
        provisional: live,
        final: scoredResult?.state === 'full_time',
        void: false,
        result: scoredResult,
        rows: (id === FID ? rows() : []).map((row) => ({
          ...row,
          memberName: MEMBERS.find((m) => m.id === row.memberId)!.name,
          isDefault: row.isDefault ?? false,
          dutyId: null,
          wp: row.points ?? 0,
          mp: 0,
          bp: 0,
          points: row.points ?? 0,
          scored: !!scoredResult,
        })),
      };
    },
    recordPicks: (fixtureId: string, picks: readonly StewardPick[]) => {
      recorded.push({ fixtureId, picks });
      return Promise.resolve();
    },
    removePick: (fixtureId: string, memberId: string) => {
      removed.push(`${fixtureId}/${memberId}`);
      return Promise.resolve();
    },
    recordStandings: (roundId: number, entries: readonly StandingEntry[]) => {
      standings.push({ roundId, entries });
      return Promise.resolve();
    },
    clearStanding: () => Promise.resolve(),
  };
  TestBed.configureTestingModule({ providers: [{ provide: RoundViewService, useValue: view }] });
  const fixture = TestBed.createComponent(PicksCard);
  fixture.componentRef.setInput('dialog', { open: () => undefined });
  fixture.componentRef.setInput('dutyDialog', { open: () => undefined });
  const root = fixture.nativeElement as HTMLElement;
  const radio = (memberId: string, side: string) =>
    root.querySelector<HTMLInputElement>(`input[name="pick-${FID}-${memberId}"][value="${side}"]`)!;
  const margin = (memberId: string) =>
    root.querySelector<HTMLInputElement>(`#pick-${FID}-${memberId}-margin`)!;
  const row = (memberId: string) => margin(memberId).closest('li')!;
  const missed = (memberId: string) =>
    row(memberId).querySelector<HTMLInputElement>('.check.missed input')!;
  const type = (memberId: string, value: string) => {
    const input = margin(memberId);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const save = async () => {
    Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.includes('Save picks'))!
      .click();
    await settle();
  };
  return {
    fixture,
    root,
    radio,
    margin,
    row,
    missed,
    type,
    save,
    rows,
    locked,
    result,
    recorded,
    removed,
    standings,
  };
}

describe('PicksCard', () => {
  it('prefills the grid from the saved picks', async () => {
    const { radio, margin } = setup();
    await settle();
    expect(radio('a', 'home').checked).toBe(true);
    expect(margin('a').value).toBe('7');
    expect(radio('b', 'draw').checked).toBe(true);
    expect(margin('b').value).toBe('');
    expect(margin('b').disabled).toBe(true);
    expect(['home', 'draw', 'away'].some((side) => radio('c', side).checked)).toBe(false);
    expect(margin('c').disabled).toBe(false);
  });

  it('labels each row’s side choice and shows the fixture strip with its status', async () => {
    const { root } = setup();
    await settle();
    expect(root.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe(
      "Annas's pick",
    );
    const chosen = root.querySelector('.fixture-strip button[aria-pressed="true"]');
    expect(chosen?.textContent).toContain('Awaiting picks');
  });

  it('clears and disables the margin for a draw', async () => {
    const { radio, margin } = setup();
    await settle();
    radio('a', 'draw').click();
    await settle();
    expect(margin('a').value).toBe('');
    expect(margin('a').disabled).toBe(true);
    radio('a', 'away').click();
    await settle();
    expect(margin('a').disabled).toBe(false);
  });

  it('clears the side and margin for a missed pick', async () => {
    const { radio, margin, missed } = setup();
    await settle();
    missed('a').click();
    await settle();
    expect(['home', 'draw', 'away'].some((side) => radio('a', side).checked)).toBe(false);
    expect(margin('a').value).toBe('');
    expect(margin('a').disabled).toBe(true);
  });

  it('sends only the rows that changed', async () => {
    const { radio, type, missed, save, recorded, removed } = setup();
    await settle();
    radio('c', 'away').click();
    await settle();
    type('c', '5');
    missed('b').click();
    await settle();
    await save();
    expect(recorded).toEqual([
      {
        fixtureId: FID,
        picks: [
          { memberId: 'b', side: 'missed', margin: null, isDefault: false },
          { memberId: 'c', side: 'away', margin: 5, isDefault: false },
        ],
      },
    ]);
    expect(removed).toEqual([]);
  });

  it('asks for a margin before saving a side without one', async () => {
    const { radio, save, margin, recorded, root } = setup();
    await settle();
    radio('c', 'home').click();
    await settle();
    await save();
    expect(recorded).toEqual([]);
    expect(margin('c').getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('#picks-error')?.textContent).toContain('margin from 1 to 150');
  });

  it('removes the pick of a row that was emptied and skips rows left empty', async () => {
    const { missed, save, recorded, removed } = setup();
    await settle();
    // Missed and then unticked again: no side, no margin.
    missed('a').click();
    await settle();
    missed('a').click();
    await settle();
    await save();
    expect(recorded).toEqual([]);
    expect(removed).toEqual([`${FID}/a`]);
  });

  it('shows the grid read-only before kickoff', async () => {
    const { root, radio, margin, missed } = setup({ locked: false });
    await settle();
    expect(root.querySelector('.grid-note')?.textContent).toContain(
      'Members make their own picks until kickoff. You can correct picks from kickoff.',
    );
    expect(radio('a', 'home').disabled).toBe(true);
    expect(margin('a').disabled).toBe(true);
    expect(missed('c').disabled).toBe(true);
    expect(
      Array.from(root.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Save picks'),
      ),
    ).toBe(false);
  });

  it('shows each row’s points once the match has a score', async () => {
    const { root } = setup({ result: { homeScore: 24, awayScore: 23, state: 'full_time' } });
    await settle();
    const scores = Array.from(root.querySelectorAll('.grid-row .score strong')).map((s) =>
      s.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(scores).toEqual([', total 1.5 points', ', total 0 points']);
    expect(root.querySelector('.fixture-strip button[aria-pressed="true"]')?.textContent).toContain(
      'Final',
    );
  });

  it('records an override while keeping the round’s other recorded totals', async () => {
    const { root, standings } = setup();
    await settle();
    root.querySelector<HTMLButtonElement>('#override-button-a')!.click();
    await settle();
    const input = root.querySelector<HTMLInputElement>('#override-a')!;
    input.value = '3.25';
    input.dispatchEvent(new Event('input'));
    input.closest('form')!.dispatchEvent(new Event('submit'));
    await settle();
    expect(standings).toEqual([
      {
        roundId: 1,
        entries: [
          { memberId: 'b', points: 4 },
          { memberId: 'a', points: 3.25 },
        ],
      },
    ]);
  });
});
