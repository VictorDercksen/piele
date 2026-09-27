import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LiveScoresService } from '../../core/api/live-scores.service';
import { Fixture } from '../../core/competition/competition.models';
import { CompetitionService } from '../../core/competition/competition.service';
import { competition } from '../../core/competition/registry';
import { BADGES } from '../../core/league/badges';
import { LeagueContext } from '../../core/league/league-context';
import { LeagueData } from '../../core/league/league-data';
import { SampleLeagueData } from '../../core/league/sample-league-data';
import { ProfileStore } from '../../core/profile/profile.store';
import { BREAKDOWN_STORAGE_KEY, StandingsPage } from './standings.page';

const URC = competition('urc-2026-27');
const NOW = '2026-09-27T08:00:00Z';

/** The sample build on a frozen date with round 1 selected, opened at `url`. */
async function open(url: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse(NOW));
  const rounds = URC.buildRounds(1);
  @Injectable()
  class Frozen extends CompetitionService {
    override get currentRoundId() {
      return 1;
    }
    override get rounds() {
      return rounds;
    }
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'standings', component: StandingsPage }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: LeagueData, useClass: SampleLeagueData },
      { provide: CompetitionService, useClass: Frozen },
      {
        provide: LiveScoresService,
        useValue: {
          clock: signal(Date.parse(NOW)).asReadonly(),
          merge: (fixture: Fixture) => fixture,
        },
      },
    ],
  });
  const context = TestBed.inject(LeagueContext);
  await context.ensureAccount();
  await context.select('piele');
  await TestBed.inject(ProfileStore).save({
    displayName: 'Test Member',
    teamId: 'dhl-stormers',
    photo: null,
  });
  const harness = await RouterTestingHarness.create();
  const page = await harness.navigateByUrl(url, StandingsPage);
  harness.detectChanges();
  const element = harness.routeNativeElement!;
  const text = (selector: string) =>
    [...element.querySelectorAll(selector)].map((node) =>
      node.textContent!.replace(/\s+/g, ' ').trim(),
    );
  const button = (name: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent!.trim() === name,
    )!;
  return { harness, page, element, text, button, data: TestBed.inject(LeagueData) };
}

describe('StandingsPage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows the round table with the cap and spoon beside the names', async () => {
    const { element, text, button } = await open('/standings');
    expect(button('Round').getAttribute('aria-pressed')).toBe('true');
    expect(text('.honours-heading h2')).toEqual(['Superbru points']);
    expect(text('.board-status .tag')).toEqual(['complete']);
    expect(text('.points-row .member-name')).toEqual([
      'PieterW',
      'Liam',
      'Test Member',
      'Johan',
      'Arno',
      'Franco',
    ]);
    expect(text('.points-row strong')[0]).toBe('15.5');
    const rows = element.querySelectorAll('.points-row');
    const cap = rows[0].querySelector<HTMLImageElement>('img.badge')!;
    expect(cap.getAttribute('src')).toBe(BADGES.cap.src);
    expect(cap.alt).toBe('Round winner');
    const spoon = rows[5].querySelector<HTMLImageElement>('img.badge')!;
    expect(spoon.getAttribute('src')).toBe(BADGES.spoon.src);
    expect(spoon.alt).toBe('Round spoon');
    expect(rows[2].querySelector('img.badge')).toBeNull();
    expect(rows[2].classList).toContain('you');
    expect(element.querySelector('.override-tag')).toBeNull();
    expect(element.querySelector('.breakdown-bar')).toBeNull();
  });

  it('opens the tab named in the query parameter and records a change there', async () => {
    const { harness, element, text, button } = await open('/standings?round=2&table=season');
    const router = TestBed.inject(Router);
    expect(button('Season').getAttribute('aria-pressed')).toBe('true');
    expect(text('.honours-heading > span')).toEqual(['PIELE / SEASON']);
    expect(text('.honours-heading h2')).toEqual(['Superbru season']);
    expect(text('.page-description')[0]).toContain('Whole season up to the selected round');
    expect(text('.points-row .member-name')[0]).toBe('Johan');
    // Last season's champion wears the crown; the round 2 cap is his too.
    const johan = element.querySelector('.points-row')!;
    expect([...johan.querySelectorAll<HTMLImageElement>('img.badge')].map((i) => i.alt)).toEqual([
      "Last season's champion",
      'Round winner',
    ]);
    expect(text('.rounds-count')[0]).toBe('2 rounds');

    button('House marks').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(router.url).toBe('/standings?round=2&table=marks');
    expect(button('House marks').getAttribute('aria-pressed')).toBe('true');
    expect(text('.honours-heading h2')).toEqual(['House marks']);

    button('Round').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(router.url).toBe('/standings?round=2&table=round');
    expect(text('.honours-heading > span')).toEqual(['PIELE / ROUND 02']);
  });

  it('leaves the URL alone on load and ignores an unknown table', async () => {
    const { text, button } = await open('/standings?table=league');
    expect(TestBed.inject(Router).url).toBe('/standings?table=league');
    expect(button('Round').getAttribute('aria-pressed')).toBe('true');
    expect(text('.honours-heading h2')).toEqual(['Superbru points']);
  });

  it('reveals the breakdown and remembers it in this browser', async () => {
    const { harness, element, text, button } = await open('/standings');
    const toggle = button('Show breakdown');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    harness.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem(BREAKDOWN_STORAGE_KEY)).toBe('1');
    expect(
      [...element.querySelectorAll('.table-label abbr')].map((a) => [
        a.textContent,
        a.getAttribute('title'),
      ]),
    ).toEqual([
      ['WP', 'Win points'],
      ['MP', 'Margin points'],
      ['GSP', 'Grand slam points'],
      ['BP', 'Bonus points'],
    ]);
    expect(text('.breakdown-legend li')).toEqual([
      'WP Win points',
      'MP Margin points',
      'GSP Grand slam points',
      'BP Bonus points',
    ]);
    const top = element.querySelector('.points-row')!;
    expect(text('.points-row')[0]).toContain('PieterW');
    expect(top.querySelectorAll('.cell')).toHaveLength(4);
    expect(top.querySelector('.visually-hidden')!.textContent!.replace(/\s+/g, ' ').trim()).toMatch(
      /^[\d.]+ win points, [\d.]+ margin points, [\d.]+ grand slam points, [\d.]+ bonus points$/,
    );
    const widths = [...top.querySelectorAll<HTMLElement>('.breakdown-bar .segment')].map((s) =>
      parseFloat(s.style.width),
    );
    expect(widths).toHaveLength(4);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100);

    toggle.click();
    harness.detectChanges();
    expect(localStorage.getItem(BREAKDOWN_STORAGE_KEY)).toBe('0');
    expect(element.querySelector('.breakdown-bar')).toBeNull();
  });

  it('starts with the breakdown open when remembered', async () => {
    localStorage.setItem(BREAKDOWN_STORAGE_KEY, '1');
    const { element, button } = await open('/standings');
    expect(button('Show breakdown').getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelectorAll('.breakdown-bar')).toHaveLength(6);
  });

  it('still toggles the breakdown when browser storage refuses', async () => {
    // Only the breakdown key is refused: the sample profile still saves.
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (key === BREAKDOWN_STORAGE_KEY) throw new Error('blocked');
      return getItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === BREAKDOWN_STORAGE_KEY) throw new Error('blocked');
      setItem.call(this, key, value);
    });
    const { harness, element, button } = await open('/standings');
    const toggle = button('Show breakdown');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    harness.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelectorAll('.breakdown-bar').length).toBeGreaterThan(0);
  });

  it('tags a recorded total that differs from the derived one', async () => {
    const { harness, element, data } = await open('/standings');
    await data.recordStandings(1, [{ memberId: 'member-fb', points: 30 }]);
    harness.detectChanges();
    const franco = [...element.querySelectorAll('.points-row')].find((row) =>
      row.textContent!.includes('Franco'),
    )!;
    const tag = franco.querySelector('.override-tag')!;
    expect(tag.textContent!.trim()).toBe('override');
    expect(tag.getAttribute('title')).toBe('Recorded total differs from the derived one');
    expect(franco.querySelector('strong')!.textContent).toBe('30.0');
    expect(element.querySelectorAll('.override-tag')).toHaveLength(1);
  });

  it('shows the empty states for a round and a season without scores', async () => {
    const { harness, text, button, data } = await open('/standings?round=3');
    expect(text('.round-empty h2')).toEqual(['No picks or results for Round 03 yet.']);
    expect(text('.round-empty p')).toEqual([
      'Picks appear once members record them and the matches kick off.',
    ]);
    expect(text('.board-status .tag')).toEqual(['awaiting picks']);
    expect(button('Show breakdown')).toBeUndefined();
    button('Season').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    // Rounds 1 and 2 are scored, so the season table has rows.
    expect(text('.points-row .member-name')).toHaveLength(6);
    // From round 4 on, nothing up to round 3 counts.
    await data.saveRules({ startingRound: 4 });
    harness.detectChanges();
    expect(text('.points-row')).toEqual([]);
    expect(text('.round-empty h2')).toEqual(['No rounds scored yet.']);
  });
});
