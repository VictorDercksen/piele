import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { competition } from '../../../core/competition/registry';
import { ApiError } from '../../../core/league/http-league-data';
import { LeagueContext } from '../../../core/league/league-context';
import { LeagueMember, MemberPick, NewPick, PickSide } from '../../../core/league/league.models';
import {
  FixturePicksView,
  PickRowView,
  RoundViewService,
} from '../../../core/league/round-view.service';
import { DEFAULT_RULES } from '../../../core/league/superbru';
import { PicksPanel, ordinal } from './picks-panel';

const URC = competition('urc-2026-27');
// Round 1: Zebre Parma v Vodacom Bulls.
const LOCATED = URC.locate('292590')!;

function pick(memberId: string, name: string, side: PickSide, margin: number | null): MemberPick {
  return { memberId, memberName: name, side, margin, isDefault: false, dutyId: null };
}

const MINE = pick('member-me', 'Victor', 'away', 20);

function row(
  source: MemberPick,
  score: Partial<Pick<PickRowView, 'wp' | 'mp' | 'bp' | 'points' | 'scored'>> = {},
): PickRowView {
  const home = source.side === 'home';
  const away = source.side === 'away';
  const club = home ? URC.team('zebre-parma') : away ? URC.team('vodacom-bulls') : undefined;
  return {
    ...source,
    you: source.memberId === 'member-me',
    name: source.memberName,
    photo: null,
    teamId: '',
    clubId: club?.id ?? null,
    clubShortName: club?.shortName ?? null,
    clubColour: club?.colour ?? null,
    clubAccent: club?.accent ?? null,
    wp: 0,
    mp: 0,
    bp: 0,
    points: 0,
    distance: null,
    scored: false,
    correct: false,
    ...score,
  };
}

function picksView(change: Partial<FixturePicksView> = {}): FixturePicksView {
  return {
    fixture: LOCATED.fixture,
    round: LOCATED.round,
    locked: false,
    provisional: false,
    final: false,
    void: false,
    recorded: false,
    hidden: true,
    result: null,
    myPick: null,
    rows: [],
    sway: { home: 0, draw: 0, away: 0 },
    myPlace: null,
    ...change,
  };
}

/** Before kickoff with the member's pick in. */
const OPEN = picksView({
  hidden: false,
  recorded: true,
  myPick: MINE,
  rows: [row(pick('member-dan', 'DanB97', 'home', 15)), row(MINE)],
  sway: { home: 50, draw: 0, away: 50 },
});

/** Full time, Bulls by 35: three picks, a shared bonus and a missed pick. */
const FINAL = picksView({
  locked: true,
  final: true,
  hidden: false,
  recorded: true,
  myPick: MINE,
  result: { homeScore: 10, awayScore: 45, state: 'full_time' },
  rows: [
    row(pick('member-dan', 'DanB97', 'home', 15), { scored: true }),
    row(pick('member-wihan', 'Wihan4', 'away', 25), {
      scored: true,
      wp: 1,
      mp: 0,
      bp: 0.25,
      points: 1.25,
    }),
    row(MINE, { scored: true, wp: 1, points: 1 }),
    row(pick('member-deon', 'Deon', 'missed', null), { scored: true }),
  ],
  sway: { home: 33, draw: 0, away: 67 },
  myPlace: 2,
});

const MEMBERS: LeagueMember[] = ['member-me', 'member-dan', 'member-wihan', 'member-deon'].map(
  (id) => ({ id, name: id, teamId: '' }) as LeagueMember,
);

describe('PicksPanel', () => {
  let saved: [string, NewPick][];
  let refusal: Error | null;

  function setup(start: FixturePicksView, options: { admin?: boolean; steward?: boolean } = {}) {
    saved = [];
    refusal = null;
    const current = signal(start);
    const view = {
      picksFor: () => current(),
      adminView: signal(options.admin ?? false),
      administers: signal(options.steward ?? options.admin ?? false),
      rules: signal(DEFAULT_RULES),
      members: signal(MEMBERS),
      savePick: (fixtureId: string, value: NewPick) => {
        saved.push([fixtureId, value]);
        if (refusal) return Promise.reject(refusal);
        current.set(OPEN);
        return Promise.resolve();
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RoundViewService, useValue: view },
        { provide: LeagueContext, useValue: { url: (path = '') => `/piele${path}` } },
      ],
    });
    const fixture = TestBed.createComponent(PicksPanel);
    fixture.componentRef.setInput('fixtureId', '292590');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = (selector: string) =>
      root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    const settle = async () => {
      for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const choose = async (side: 'home' | 'draw' | 'away') => {
      root.querySelector<HTMLInputElement>(`input[type="radio"][value="${side}"]`)!.click();
      await settle();
    };
    const margin = () => root.querySelector<HTMLInputElement>('#pick-margin')!;
    const typeMargin = async (value: string) => {
      margin().value = value;
      margin().dispatchEvent(new Event('input'));
      await settle();
    };
    const submit = async () => {
      root.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { fixture, root, current, text, choose, margin, typeMargin, submit, settle };
  }

  it('shows only the pick form before kickoff until the member has picked', async () => {
    const { root, text, settle } = setup(picksView());
    await settle();
    expect(text('.tag')).toBe('open');
    const group = root.querySelector('[role="radiogroup"]')!;
    expect(root.querySelector(`#${group.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'Your pick',
    );
    const labels = Array.from(group.querySelectorAll('.segment-name')).map((l) => l.textContent);
    expect(labels).toEqual(['Zebre', 'Draw', 'Bulls']);
    expect(group.querySelectorAll('img.jersey')).toHaveLength(2);
    expect(root.querySelector('#pick-margin')?.getAttribute('inputmode')).toBe('numeric');
    expect(text('.form-note')).toMatch(
      /^Make your pick to see the pool's picks\. Picks lock at kickoff, \d+ \w{3} \d{2}:\d{2} \S+\.$/,
    );
    expect(root.querySelector('table')).toBeNull();
    expect(root.querySelector('.sway')).toBeNull();
    expect(root.querySelector('.mine')).toBeNull();
  });

  it('shows errors only after a submit attempt and saves the pick', async () => {
    const { root, text, choose, typeMargin, submit } = setup(picksView());
    expect(root.querySelector('.field-error')).toBeNull();
    await submit();
    expect(saved).toEqual([]);
    expect(text('#pick-side-error')).toBe('Choose a side or a draw.');
    expect(text('#pick-margin-error')).toBe('Enter a margin from 1 to 150.');

    await choose('away');
    await typeMargin('151');
    await submit();
    expect(saved).toEqual([]);
    expect(root.querySelector('#pick-margin')?.getAttribute('aria-invalid')).toBe('true');

    await typeMargin('20');
    await submit();
    expect(saved).toEqual([['292590', { side: 'away', margin: 20 }]]);
    // The data layer adopted the pick: the panel shows the member's strip and the pool.
    expect(root.querySelector('form')).toBeNull();
    expect(text('.mine .chip')).toBe('Bulls by 20');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('disables and clears the margin on a draw and saves a draw as margin 0', async () => {
    const { margin, choose, typeMargin, submit, text } = setup(picksView());
    await choose('home');
    await typeMargin('7');
    await choose('draw');
    expect(margin().disabled).toBe(true);
    expect(margin().value).toBe('');
    expect(text('#pick-margin-hint')).toBe('A draw has no margin.');
    await choose('home');
    expect(margin().disabled).toBe(false);
    await choose('draw');
    await submit();
    expect(saved).toEqual([['292590', { side: 'draw', margin: 0 }]]);
  });

  it('names the kickoff when the API says picks are locked', async () => {
    const { choose, typeMargin, submit, text, root } = setup(picksView());
    refusal = new ApiError(422, 'picks_locked', 'Picks for this match closed at kickoff.');
    await choose('home');
    await typeMargin('3');
    await submit();
    expect(text('.form-error')).toMatch(
      /^Picks for this match closed at kickoff, \d+ \w{3} \d{2}:\d{2} \S+\.$/,
    );
    expect(root.querySelector('form')).not.toBeNull();
  });

  it('shows the pool, the sway bar and an Edit button once the member has picked', async () => {
    const { root, text, settle, margin } = setup(OPEN);
    await settle();
    expect(text('.tag')).toBe('open');
    expect(root.querySelector('form')).toBeNull();
    expect(root.querySelector('.mine')?.classList).toContain('you');
    expect(text('.mine .chip')).toBe('Bulls by 20');
    expect(root.querySelector('.sway')?.getAttribute('aria-label')).toBe(
      "The pool's split: Zebre 50%, Bulls 50%.",
    );
    expect(root.querySelectorAll('.sway-part b')).toHaveLength(2);
    // No marks or points before kickoff.
    expect(root.querySelectorAll('thead th')).toHaveLength(2);
    expect(root.querySelector('.mark')).toBeNull();
    const you = root.querySelector('tbody tr.you')!;
    expect(you.querySelector('.name')?.textContent).toBe('Victor');
    expect(you.querySelector('.you-tag')?.textContent).toBe('YOU');

    root.querySelector<HTMLButtonElement>('.mine .edit')!.click();
    await settle();
    expect(root.querySelector<HTMLInputElement>('input[value="away"]')!.checked).toBe(true);
    expect(margin().value).toBe('20');
    expect(text('.form-note')).toMatch(/^Picks lock at kickoff/);
    // The pool stays below the form while editing.
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('scores a locked fixture with marks, points, place and the rules legend', async () => {
    const { root, text, settle } = setup(FINAL);
    await settle();
    expect(text('.tag')).toBe('final');
    expect(text('.mine')).toContain('Bulls by 20');
    expect(text('.mine-points')).toBe('1 pt');
    expect(text('.mine-place')).toBe('2nd of 4 in this match');
    expect(root.querySelector('.mine .edit')).toBeNull();

    const headers = Array.from(root.querySelectorAll('thead abbr')).map((a) => [
      a.textContent,
      a.getAttribute('title'),
    ]);
    expect(headers).toEqual([
      ['W', 'Outcome'],
      ['M', 'Within 5'],
      ['B', 'Closest'],
    ]);
    const rows = Array.from(root.querySelectorAll('tbody tr'));
    const marks = (tr: Element) =>
      Array.from(tr.querySelectorAll('.c-mark .visually-hidden')).map((m) => m.textContent);
    expect(marks(rows[0])).toEqual(['no outcome point', 'no margin point', 'no bonus point']);
    expect(marks(rows[1])).toEqual(['outcome point', 'no margin point', '0.25 of the bonus point']);
    expect(rows[1].querySelectorAll('.mark.earned')).toHaveLength(2);
    expect(rows[1].querySelector('.fraction')?.textContent?.trim()).toBe('0.25');
    expect(rows[1].querySelector('.c-points')?.textContent?.trim()).toBe('1.25');
    expect(rows[3].querySelector('.chip.missed')?.textContent).toBe('No pick');
    expect(text('.panel-source')).toBe(
      'Superbru scoring · Outcome 1 · Within 5 0.5 · Closest 1, shared when tied, within 15 only.',
    );
    expect(root.querySelector('a.record')).toBeNull();
  });

  it('hides marks before results and links the steward to record missing picks', async () => {
    const locked = picksView({
      ...FINAL,
      final: false,
      result: null,
      myPlace: null,
      rows: FINAL.rows.map((r) => ({ ...r, scored: false, wp: 0, mp: 0, bp: 0, points: 0 })),
    });
    const { root, text, settle } = setup(locked, { steward: true });
    await settle();
    expect(text('.tag')).toBe('locked');
    expect(root.querySelector('.mark')).toBeNull();
    expect(text('tbody tr .c-points')).toMatch(/^–\s?not scored yet$/);
    expect(root.querySelector('.mine-points')).toBeNull();
    const link = root.querySelector<HTMLAnchorElement>('a.record')!;
    expect(link.textContent?.trim()).toBe('Record picks');
    expect(link.getAttribute('href')).toBe('/piele/captain#picks');
  });

  it('shows "No pick" and awaiting picks for a member who missed a locked fixture', async () => {
    const { text, settle } = setup(
      picksView({
        ...FINAL,
        final: false,
        recorded: false,
        myPick: null,
        myPlace: null,
        result: null,
        rows: FINAL.rows.filter((r) => !r.you).map((r) => ({ ...r, scored: false })),
      }),
    );
    await settle();
    expect(text('.tag')).toBe('awaiting picks');
    expect(text('.mine .chip')).toBe('No pick');
  });

  it('gives the admin viewing a league it is not in the pool without a form', async () => {
    const adminOpen = picksView({ ...OPEN, recorded: false, myPick: null, hidden: false });
    const { root, settle } = setup(adminOpen, { admin: true });
    await settle();
    expect(root.querySelector('form')).toBeNull();
    expect(root.querySelector('.mine')).toBeNull();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '103rd',
    ]);
  });
});
