import { expect, test, Page, Route } from '@playwright/test';
import { seedProfile } from './support';

// Round 1: Connacht v Stormers (292585) and Benetton v Dragons (292584).
const STORMERS = '292585';

function player(number: number, side: string, captain = false) {
  return {
    number,
    name: `${side} Player ${number}`,
    position: number === 1 ? 'Prop' : number > 15 ? `sub ${number - 15}` : null,
    captain,
    dateOfBirth: '2000-01-01',
    birthCountry: number === 2 ? null : 'South Africa',
  };
}

function sheet(side: string) {
  return {
    starters: Array.from({ length: 15 }, (_, i) => player(i + 1, side, i === 7)),
    replacements: Array.from({ length: 8 }, (_, i) => player(i + 16, side)),
  };
}

function centre(fixtureId: string, overrides: Record<string, unknown> = {}) {
  return {
    fixtureId,
    round: 1,
    kickoffUtc: '2026-09-25T18:45:00Z',
    venue: 'Dexcom Stadium',
    home: { id: 'connacht-rugby', name: 'Connacht Rugby', shortName: 'Connacht' },
    away: { id: 'dhl-stormers', name: 'DHL Stormers', shortName: 'Stormers' },
    generatedAt: '2026-09-23T12:00:00Z',
    teamsheets: {
      status: 'ok',
      source: 'URC match centre',
      fetchedAt: '2026-09-23T11:30:00Z',
      home: sheet('Connacht'),
      away: sheet('Stormers'),
    },
    weather: {
      status: 'ok',
      source: 'Open-Meteo',
      fetchedAt: '2026-09-23T11:00:00Z',
      forecastHourUtc: '2026-09-25T19:00Z',
      stadium: 'Dexcom Stadium',
      city: 'Galway',
      temperatureC: 13.4,
      feelsLikeC: 11.2,
      rainChancePercent: 60,
      precipitationMm: 0.8,
      windKmh: 24,
      gustKmh: 48,
      weatherCode: 61,
      condition: 'Light rain',
    },
    ...overrides,
  };
}

const requested: string[] = [];

async function mockApi(page: Page, handler?: (id: string, route: Route) => Promise<void>) {
  requested.length = 0;
  await page.route('**/v1/competitions/*/matches/*', async (route) => {
    const id = route.request().url().split('/').pop()!.split('?')[0];
    requested.push(id);
    if (handler) return handler(id, route);
    await route.fulfill({ json: centre(id) });
  });
}

test.beforeEach(async ({ page }) => {
  await seedProfile(page);
});

test('hero opens the featured fixture with teamsheets and forecast', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.goto('/piele?round=1');
  await page.getByRole('button', { name: 'Enter the match centre' }).click();
  await expect(page).toHaveURL(new RegExp(`/piele/match/${STORMERS}\\?round=1`));
  await expect(page.locator('.page-heading .eyebrow')).toContainText('ROUND 01 / MATCH CENTRE');
  const header = page.locator('app-match-hero');
  await expect(header).toContainText('Connacht');
  await expect(header).toContainText('YOUR TEAM');
  await expect(header).toContainText('Dexcom Stadium');
  await expect(header).toContainText('20:45');
  await expect(page.locator('.deadline-banner')).toContainText('house pick deadline');
  await expect(page.locator('.fixture-ribbon button.active')).toContainText('Connacht');
  await expect(header.getByRole('img', { name: 'Ireland' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Enter the match centre' })).toHaveCount(0);

  const sheets = page.locator('.panel.teamsheets');
  await expect(sheets.locator('.players li')).toHaveCount(46);
  await expect(sheets.locator('.players .name i')).toHaveCount(2);
  await expect(sheets).toContainText('Stormers Player 8');
  // Country-of-birth flags and ages at kickoff, with each side's average age.
  await expect(sheets.getByRole('img', { name: 'South Africa' })).toHaveCount(44);
  await expect(sheets.locator('.players .age').first()).toHaveText('26');
  await expect(sheets.locator('.average-age')).toHaveCount(2);
  await expect(sheets.locator('.average-age').first()).toContainText('26.7');
  await expect(sheets.locator('.sheet.has-banner')).toHaveCount(2);
  await expect(sheets).not.toContainText('sub 1');
  await expect(sheets).toContainText('checked 23 Sep 13:30 SAST');

  const weather = page.locator('.panel.weather');
  await expect(weather).toContainText('13°');
  await expect(weather).toContainText('Light rain');
  await expect(weather).toContainText('60%');
  await expect(weather).toContainText('24 km/h');
  await expect(weather).toContainText('Dexcom Stadium, Galway at 21:00 SAST');
  // Light rain with no isDay at 21:00 SAST reads as a rainy night sky.
  await expect(weather).toHaveAttribute('data-sky', 'rain');
  await expect(weather).toHaveAttribute('data-time', 'night');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('match-centre-desktop.png'), fullPage: true });

  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await page.screenshot({ path: testInfo.outputPath('match-centre-mobile.png'), fullPage: true });

  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await breadcrumb.getByRole('link', { name: 'HOME' }).click();
  await expect(page).toHaveURL(/\/piele\?round=1$/);
  await expect(page.getByRole('button', { name: 'Enter the match centre' })).toBeVisible();
});

test('ribbon switches fixtures, round changes follow, deep links align the round', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/piele/match/${STORMERS}?round=1`);
  await expect(page.locator('app-match-hero')).toContainText('Connacht');
  await page.locator('.fixture-ribbon button').filter({ hasText: 'Benetton' }).click();
  await expect(page).toHaveURL(/\/piele\/match\/292584\?round=1/);
  await expect(page.locator('app-match-hero')).toContainText('Benetton');
  await expect(page.locator('.fixture-ribbon button.active')).toContainText('Benetton');

  await page.getByRole('button', { name: 'Next round' }).click();
  await expect(page).toHaveURL(/\/piele\/match\/\d+\?round=2/);
  await expect(page.getByRole('region', { name: 'Selected round' })).toContainText('Round 02');
  await expect(page.locator('.fixture-ribbon button.active')).toContainText('Stormers');
  const roundTwoId = page.url().match(/\/match\/(\d+)/)![1];
  expect(roundTwoId).not.toBe(STORMERS);

  await page.goto(`/piele/match/${STORMERS}?round=5`);
  await expect(page).toHaveURL(new RegExp(`/piele/match/${STORMERS}\\?round=1`));
  await expect(page.getByRole('region', { name: 'Selected round' })).toContainText('Round 01');
  await expect(page.locator('app-match-hero')).toContainText('Connacht');

  await page.goto('/piele/match/nope?round=3');
  await expect(page).toHaveURL(/\/piele\?round=3$/);
  await expect(page.locator('app-match-hero')).toBeVisible();
  expect(requested.filter((id) => id === 'nope')).toEqual([]);
});

test('sections explain missing data and the page survives an API outage', async ({ page }) => {
  await mockApi(page, async (id, route) => {
    await route.fulfill({
      json: centre(id, {
        teamsheets: { status: 'not_published', source: 'URC match centre', fetchedAt: null },
        weather: { status: 'unavailable', source: 'Open-Meteo', fetchedAt: null },
      }),
    });
  });
  await page.goto(`/piele/match/${STORMERS}?round=1`);
  await expect(page.locator('.panel.teamsheets')).toContainText('usually published about 48 hours');
  await expect(page.locator('.panel.teamsheets .tag')).toHaveText('not published');
  await expect(page.locator('.panel.weather')).toContainText('forecast could not be loaded');

  await page.unroute('**/v1/competitions/*/matches/*');
  await page.route('**/v1/competitions/*/matches/*', (route) =>
    route.fulfill({ status: 503, body: 'down' }),
  );
  await page.getByRole('button', { name: 'Next round' }).click();
  await expect(page.getByRole('alert')).toContainText('The league API could not be reached');
  await expect(page.locator('app-match-hero')).toBeVisible();
  await page.unroute('**/v1/competitions/*/matches/*');
  await mockApi(page);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.panel.weather')).toContainText('Light rain');
});
