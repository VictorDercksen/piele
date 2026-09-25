import { expect, test, Page } from '@playwright/test';

// Round 1, Friday 25 September: Benetton v Dragons (292584) kicks off at 18:45 UTC.
const BENETTON = '292584';
const ROUND_ONE = ['292584', '292585', '292586', '292587', '292588', '292589', '292590', '292591'];
const KICKOFF = Date.parse('2026-09-25T18:45:00Z');

type State = 'scheduled' | 'live' | 'half_time' | 'full_time';

interface Stage {
  state: State;
  minute: number | null;
  home: number;
  away: number;
  events: ReturnType<typeof event>[];
}

function event(
  id: number,
  time: string,
  side: 'home' | 'away',
  kind: string,
  points: number,
  score: [number, number] | null,
  period = 'first half',
) {
  return { id, minute: Number.parseInt(time), time, period, side, kind, points, player: `Player ${id}`, score };
}

const FIRST_HALF = [
  event(1, '6', 'home', 'penalty_goal', 3, [3, 0]),
  event(2, '18', 'away', 'try', 5, [3, 5]),
  event(3, '19', 'away', 'conversion', 2, [3, 7]),
  event(4, '30', 'away', 'yellow_card', 0, null),
];
const LIVE: Stage = { state: 'live', minute: 31, home: 3, away: 7, events: FIRST_HALF };
const SECOND_HALF: Stage = {
  state: 'live',
  minute: 55,
  home: 10,
  away: 7,
  events: [...FIRST_HALF, event(5, '52', 'home', 'penalty_try', 7, [10, 7], 'second half')],
};
const FULL_TIME: Stage = { ...SECOND_HALF, state: 'full_time', minute: null };

function score(stage: Stage, fetchedAt: string) {
  return {
    status: 'ok',
    source: 'URC match centre',
    fetchedAt,
    state: stage.state,
    period: stage.state === 'full_time' ? 'post match' : 'first half',
    minute: stage.minute,
    clockRunning: stage.state === 'live',
    home: { score: stage.home, halfTime: 3 },
    away: { score: stage.away, halfTime: 7 },
    events: stage.events,
  };
}

function scheduled(fixtureId: string) {
  return {
    fixtureId,
    state: 'scheduled',
    period: 'pre match',
    minute: null,
    clockRunning: false,
    home: { score: null, halfTime: null },
    away: { score: null, halfTime: null },
  };
}

/** Serves the API as the feed would during the match; `stage.current` moves it on. */
async function mockLiveApi(page: Page, stage: { current: Stage }) {
  await page.route('**/v1/rounds/*/scores', async (route) => {
    const now = new Date(await page.evaluate(() => Date.now())).toISOString();
    const { events, ...live } = score(stage.current, now);
    void events;
    await route.fulfill({
      json: {
        round: 1,
        generatedAt: now,
        status: 'ok',
        source: 'URC match centre',
        fetchedAt: now,
        matches: ROUND_ONE.map((id) =>
          id === BENETTON ? { fixtureId: id, ...live, status: undefined, source: undefined, fetchedAt: undefined } : scheduled(id),
        ),
      },
    });
  });
  await page.route('**/v1/matches/*', async (route) => {
    const now = new Date(await page.evaluate(() => Date.now())).toISOString();
    await route.fulfill({
      json: {
        fixtureId: BENETTON,
        round: 1,
        kickoffUtc: '2026-09-25T18:45:00Z',
        venue: 'Stadio Monigo',
        home: { id: 'benetton-rugby', name: 'Benetton Rugby', shortName: 'Benetton' },
        away: { id: 'dragons-rfc', name: 'Dragons RFC', shortName: 'Dragons' },
        generatedAt: now,
        teamsheets: { status: 'not_published', source: 'URC match centre', fetchedAt: null },
        weather: { status: 'past', source: 'Open-Meteo', fetchedAt: null },
        score: score(stage.current, now),
      },
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'piele-profile-v1',
      JSON.stringify({ displayName: 'Victor Dercksen', teamId: 'dhl-stormers', photo: null }),
    ),
  );
});

test('a live match updates the ribbon, hero and scoring timeline', async ({ page }, testInfo) => {
  await page.clock.install({ time: KICKOFF + 31 * 60_000 });
  const stage = { current: LIVE };
  await mockLiveApi(page, stage);
  await page.goto(`/match/${BENETTON}?round=1`);

  const ribbon = page.locator('.fixture-ribbon button').filter({ hasText: 'Benetton' });
  await expect(ribbon).toHaveClass(/live/);
  await expect(ribbon).toContainText("LIVE 31'");
  await expect(ribbon).toContainText('3–7');

  const hero = page.locator('app-match-hero');
  await expect(hero.locator('.match-label')).toHaveText('LIVE');
  await expect(hero.locator('.match-time strong')).toHaveText('3–7');
  await expect(hero.locator('.match-time small')).toHaveText("31'");

  const panel = page.locator('.panel.scoring');
  await expect(panel.locator('.tag')).toHaveText('live');
  await expect(panel.locator('.timeline li')).toHaveCount(4);
  await expect(panel.locator('.timeline li.away').first()).toContainText('Try');
  await expect(panel.locator('.timeline li.away').first()).toContainText('3–5');
  await expect(panel.getByRole('img', { name: 'Dragons' }).first()).toBeVisible();
  await expect(panel.locator('.card.yellow')).toHaveCount(1);

  // The next poll brings the second half.
  stage.current = SECOND_HALF;
  await page.clock.runFor(30_000);
  await expect(ribbon).toContainText("LIVE 55'");
  await expect(hero.locator('.match-time strong')).toHaveText('10–7');
  await expect(panel.locator('.timeline li.divider')).toHaveText('Half time 3–7');
  await expect(panel.locator('.timeline li.home').last()).toContainText('Penalty try');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('live-desktop.png'), fullPage: true });

  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await page.screenshot({ path: testInfo.outputPath('live-mobile.png'), fullPage: true });

  // Full time: the result replaces the live state.
  stage.current = FULL_TIME;
  await page.clock.runFor(30_000);
  await expect(hero.locator('.match-label')).toHaveText('FULL TIME');
  await expect(hero.locator('.match-time > span').first()).toHaveText('RESULT');
  await expect(ribbon).toContainText('FULL TIME');
  await expect(ribbon).not.toHaveClass(/live/);
  await expect(panel.locator('.tag')).toHaveText('full time');
});

test('rounds that have not started make no score request', async ({ page }) => {
  await page.clock.install({ time: KICKOFF - 2 * 24 * 60 * 60_000 });
  let requests = 0;
  await page.route('**/v1/rounds/*/scores', (route) => {
    requests++;
    return route.fulfill({ status: 500 });
  });
  await page.route('**/v1/matches/*', (route) => route.fulfill({ status: 503, body: 'down' }));
  await page.goto('/?round=1');
  await expect(page.locator('app-match-hero .match-time > span').first()).toHaveText('KICKOFF');
  await page.clock.runFor(60_000);
  expect(requests).toBe(0);
});
