import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { competition } from '../../../core/competition/registry';
import { AlertService } from '../../../core/feedback/alert.service';
import { problemTarget } from '../../../core/feedback/problem-highlight';
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
    // A crest moves the pick one point toward that side; the Draw chip picks a draw.
    const choose = async (side: 'home' | 'draw' | 'away') => {
      root
        .querySelector<HTMLButtonElement>(side === 'draw' ? '.draw-pick' : `.end.${side}`)!
        .click();
      await settle();
    };
    const strip = () => root.querySelector<HTMLElement>('.scale')!;
    const marker = () => root.querySelector<HTMLInputElement>('#pick-scale')!;
    const slide = async (value: number) => {
      marker().value = String(value);
      marker().dispatchEvent(new Event('input'));
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
    const alerts = TestBed.inject(AlertService);
    const warn = vi.spyOn(alerts, 'warn');
    const error = vi.spyOn(alerts, 'error');
    return {
      fixture,
      root,
      current,
      text,
      choose,
      strip,
      marker,
      slide,
      margin,
      typeMargin,
      submit,
      settle,
      alerts,
      warn,
      error,
    };
  }

  it('shows only the pick form before kickoff until the member has picked', async () => {
    const { root, text, settle } = setup(picksView());
    await settle();
    expect(text('.tag')).toBe('open');
    // The scale: a crest tab at each end, the marker unset in the middle.
    const marker = root.querySelector<HTMLInputElement>('#pick-scale')!;
    expect(marker.type).toBe('range');
    expect(root.querySelector(`#${marker.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'Your pick',
    );
    expect([marker.min, marker.max, marker.value]).toEqual(['-40', '40', '0']);
    expect(marker.getAttribute('aria-valuetext')).toBe('No pick yet');
    const ends = Array.from(root.querySelectorAll('.end')).map((e) => [
      e.textContent?.trim(),
      e.getAttribute('aria-label'),
    ]);
    expect(ends).toEqual([
      ['Zebre', 'One point toward Zebre'],
      ['Bulls', 'One point toward Bulls'],
    ]);
    expect(root.querySelectorAll('.end img')).toHaveLength(2);
    expect(text('.thumb')).toBe('Pick');
    expect(text('.tick-label.t50')).toBe('Draw');
    expect(root.querySelector('.draw-pick')?.getAttribute('aria-pressed')).toBe('false');
    // The margin field starts on the home side of the Draw chip.
    expect(root.querySelector('.margin-field')?.classList).not.toContain('away');
    expect(root.querySelector('#pick-margin')?.getAttribute('inputmode')).toBe('numeric');
    expect(text('.form-note')).toMatch(
      /^Make your pick to see the pool's picks\. Picks lock at kickoff, \d+ \w{3} \d{2}:\d{2} \S+\.$/,
    );
    expect(root.querySelector('table')).toBeNull();
    expect(root.querySelector('.sway')).toBeNull();
    expect(root.querySelector('.mine')).toBeNull();
  });

  it('warns once per attempt, marks and highlights the field, and saves the pick', async () => {
    const { root, text, choose, typeMargin, submit, strip, marker, margin, alerts, warn } =
      setup(picksView());
    expect(warn).not.toHaveBeenCalled();
    expect(strip().getAttribute('aria-invalid')).toBe('false');
    await submit();
    expect(saved).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Choose a side or a draw.', {
      key: 'pick-292590',
      details: ['Enter a margin from 1 to 150.'],
    });
    expect(strip().getAttribute('aria-invalid')).toBe('true');
    expect(marker().getAttribute('aria-invalid')).toBe('true');
    expect(margin().getAttribute('aria-invalid')).toBe('true');
    // The range lies unseen over the track, so the flag lands on the strip itself.
    expect(problemTarget(strip())).toBe(strip());
    expect(strip().classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(marker());
    // No inline problem text remains; the hint is the only line under the margin.
    expect(root.querySelector('.field-error, .form-error, [role="alert"]')).toBeNull();
    expect(margin().hasAttribute('aria-describedby')).toBe(false);

    await choose('away');
    expect(strip().getAttribute('aria-invalid')).toBe('false');
    expect(marker().getAttribute('aria-valuetext')).toBe('Bulls by 1');
    await typeMargin('151');
    expect(marker().getAttribute('aria-valuetext')).toBe('Bulls, no margin yet');
    expect(text('.thumb')).toBe('?');
    await submit();
    expect(saved).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith('Enter a margin from 1 to 150.', {
      key: 'pick-292590',
      details: [],
    });
    // The resubmit replaced the first card rather than stacking another.
    expect(alerts.alerts().filter((a) => a.key === 'pick-292590')).toHaveLength(1);
    expect(margin().getAttribute('aria-invalid')).toBe('true');
    expect(margin().classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(margin());

    await typeMargin('20');
    expect(marker().getAttribute('aria-valuetext')).toBe('Bulls by 20');
    await submit();
    expect(saved).toEqual([['292590', { side: 'away', margin: 20 }]]);
    // The warning is gone and a green card names the saved pick.
    expect(alerts.alerts().map((a) => [a.severity, a.message])).toEqual([
      ['success', 'Pick saved: Bulls by 20.'],
    ]);
    // The data layer adopted the pick: the panel shows the member's strip and the pool.
    expect(root.querySelector('form')).toBeNull();
    expect(text('.mine .chip')).toBe('Bulls by 20');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('reads the marker as a margin toward a side, with the middle a draw', async () => {
    const { root, text, slide, choose, typeMargin, marker, margin, strip } = setup(picksView());
    const field = () => root.querySelector('.margin-field')!;
    // Left of the middle is the home side, by the distance; the margin field sits left of Draw.
    await slide(-12);
    expect(marker().getAttribute('aria-valuetext')).toBe('Zebre by 12');
    expect(field().classList).not.toContain('away');
    expect(margin().value).toBe('12');
    expect(text('.thumb')).toBe('12');
    expect(root.querySelector('.thumb')?.getAttribute('style')).toContain('left: 35%');
    expect(root.querySelector('.fill')?.getAttribute('style')).toContain('left: 35%');
    expect(root.querySelector('.fill')?.getAttribute('style')).toContain('right: 50%');
    expect(root.querySelector('.end.home')?.classList).toContain('won');
    expect(root.querySelector('.end.away')?.classList).toContain('dim');
    // Right of it is the away side, and the field moves to the right of Draw.
    await slide(3);
    expect(marker().getAttribute('aria-valuetext')).toBe('Bulls by 3');
    expect(field().classList).toContain('away');
    expect(root.querySelector('.fill')?.getAttribute('style')).toContain('right: 46.25%');
    // A typed margin beyond the scale's reach parks the marker at the end.
    await typeMargin('55');
    expect(marker().getAttribute('aria-valuetext')).toBe('Bulls by 55');
    expect(marker().value).toBe('40');
    expect(text('.thumb')).toBe('55');
    // A crest nudges one point toward that side, through the middle to a draw and beyond.
    await typeMargin('1');
    await choose('home');
    expect(marker().getAttribute('aria-valuetext')).toBe('A draw');
    expect(marker().value).toBe('0');
    expect(root.querySelector('.draw-pick')?.getAttribute('aria-pressed')).toBe('true');
    // The disabled field stays on the last club's side of Draw.
    expect(field().classList).toContain('away');
    await choose('home');
    expect(marker().getAttribute('aria-valuetext')).toBe('Zebre by 1');
    expect(root.querySelector('.draw-pick')?.getAttribute('aria-pressed')).toBe('false');
    expect(field().classList).not.toContain('away');
    // The middle of the range is a draw too.
    await slide(0);
    expect(marker().getAttribute('aria-valuetext')).toBe('A draw');
    expect(text('.thumb')).toBe('Draw');
    expect(strip().classList).toContain('picked');
  });

  it('disables and clears the margin on a draw and saves a draw as margin 0', async () => {
    const { margin, choose, typeMargin, submit, text, alerts } = setup(picksView());
    await choose('home');
    await typeMargin('7');
    await choose('draw');
    expect(margin().disabled).toBe(true);
    expect(margin().value).toBe('');
    expect(text('#pick-margin-hint')).toBe('A draw has no margin.');
    await choose('home');
    expect(margin().disabled).toBe(false);
    expect(margin().value).toBe('1');
    await choose('draw');
    await submit();
    expect(saved).toEqual([['292590', { side: 'draw', margin: 0 }]]);
    expect(alerts.alerts().map((a) => a.message)).toEqual(['Pick saved: a draw.']);
  });

  it('warns with the kickoff when the API says picks are locked', async () => {
    const { choose, typeMargin, submit, root, warn, error } = setup(picksView());
    refusal = new ApiError(422, 'picks_locked', 'Picks for this match closed at kickoff.');
    await choose('home');
    await typeMargin('3');
    await submit();
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(
      /^Picks for this match closed at kickoff, \d+ \w{3} \d{2}:\d{2} \S+\.$/,
    );
    expect(warn.mock.calls[0][1]).toEqual({ key: 'pick-292590' });
    expect(root.querySelector('form')).not.toBeNull();
  });

  it('shows any other refusal as an error card that a later save clears', async () => {
    const { choose, typeMargin, submit, warn, error, alerts } = setup(picksView());
    refusal = new Error('The league API could not be reached.');
    await choose('home');
    await typeMargin('3');
    await submit();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('The league API could not be reached.', {
      key: 'pick-failed-292590',
    });
    expect(alerts.alerts().map((a) => a.severity)).toEqual(['error']);
    refusal = null;
    await submit();
    expect(saved).toHaveLength(2);
    // The red card is gone; only the green card for the saved pick remains.
    expect(alerts.alerts().map((a) => a.severity)).toEqual(['success']);
  });

  it('shows the pool, the sway bar and an Edit button once the member has picked', async () => {
    const { root, text, settle, margin, marker } = setup(OPEN);
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
    expect(marker().value).toBe('20');
    expect(marker().getAttribute('aria-valuetext')).toBe('Bulls by 20');
    expect(root.querySelector('.end.away')?.classList).toContain('won');
    expect(root.querySelector('.margin-field')?.classList).toContain('away');
    expect(margin().value).toBe('20');
    expect(text('.form-note')).toMatch(/^Picks lock at kickoff/);
    // The pool stays below the form while editing.
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('keeps the pool table closed by default and opens it from the chevron', async () => {
    const { root, settle } = setup(OPEN);
    await settle();
    const section = root.querySelector('section.panel')!;
    const chevron = root.querySelector<HTMLButtonElement>('.section-title .chevron')!;
    const drawer = root.querySelector('#picks-pool')!;
    // Closed: the split and the member's pick show; the table sits inert in the drawer.
    expect(section.classList).not.toContain('open');
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    expect(chevron.getAttribute('aria-label')).toBe("Show the pool's picks");
    expect(chevron.getAttribute('aria-controls')).toBe('picks-pool');
    expect(drawer.hasAttribute('inert')).toBe(true);
    expect(root.querySelector('.sway')).not.toBeNull();
    expect(root.querySelector('.mine')).not.toBeNull();
    expect(drawer.querySelector('table')).not.toBeNull();
    expect(drawer.querySelector('.panel-source')).not.toBeNull();

    chevron.click();
    await settle();
    expect(section.classList).toContain('open');
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    expect(chevron.getAttribute('aria-label')).toBe("Hide the pool's picks");
    expect(drawer.hasAttribute('inert')).toBe(false);

    chevron.click();
    await settle();
    expect(section.classList).not.toContain('open');
    expect(drawer.hasAttribute('inert')).toBe(true);
  });

  it('has no chevron while the pool is hidden and closes again for another fixture', async () => {
    const { root, current, settle, fixture } = setup(picksView());
    await settle();
    expect(root.querySelector('.chevron')).toBeNull();
    current.set(OPEN);
    await settle();
    root.querySelector<HTMLButtonElement>('.chevron')!.click();
    await settle();
    expect(root.querySelector('section.panel')?.classList).toContain('open');
    fixture.componentRef.setInput('fixtureId', '292591');
    await settle();
    expect(root.querySelector('section.panel')?.classList).not.toContain('open');
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
