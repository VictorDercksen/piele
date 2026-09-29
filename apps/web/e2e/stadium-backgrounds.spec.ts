import { expect, test } from '@playwright/test';
import { seedProfile } from './support';

/** Round 01 is the current round, whose sample fixtures the expectations below follow. */
const BEFORE_ROUND_ONE = new Date('2026-09-20T10:00:00Z');
/** Connacht host the Stormers at Dexcom Stadium in Round 01. */
const CONNACHT_STORMERS = '292585';

test.beforeEach(async ({ page }) => {
  await seedProfile(page, { displayName: 'Stadium test' });
  await page.clock.setFixedTime(BEFORE_ROUND_ONE);
  // No forecast unless a test serves one: every scene is clear, by day or night at kickoff.
  await page.route('**/v1/competitions/*/rounds/*/weather', (route) =>
    route.fulfill({ status: 503, body: 'down' }),
  );
});

test('page artwork follows the match and the favourite team’s fixture on other pages', async ({
  page,
}) => {
  await page.goto('/piele?round=1');
  const backdrop = page.locator('.page-backdrop img.visible');
  // Friday 19:45 kickoffs in Galway and Treviso are after dark.
  await expect(backdrop).toHaveAttribute('src', /stadium-weather\/connacht-rugby\/night-dry\.webp/);
  await expect(page.locator('app-match-hero .stadium-background')).toHaveCount(0);
  await expect(page.locator('.match-story')).toHaveCSS('background-image', 'none');
  await page
    .getByRole('group', { name: 'Round 01 fixtures' })
    .getByRole('button', { name: /Benetton.*Dragons/ })
    .click();
  await expect(backdrop).toHaveAttribute('src', /stadium-weather\/benetton-rugby\/night-dry\.webp/);
  await expect(backdrop).toHaveCSS('transition-duration', '0.65s');
  await page.getByRole('button', { name: 'Enter the match centre' }).click();
  await expect(page).toHaveURL(/\/piele\/match\/292584/);
  await expect(page.locator('.scope-note')).toHaveCount(0);
  await expect(page.locator('.match-story')).toHaveCSS('background-image', 'none');
  await expect(backdrop).toHaveAttribute('src', /stadium-weather\/benetton-rugby\/night-dry\.webp/);
  // The Stormers open away at Dexcom Stadium, so other pages show that ground.
  for (const label of ['Duties', 'Standings', 'Decisions', 'More']) {
    await page
      .getByRole('navigation', { name: 'League navigation', exact: true })
      .getByRole('link', { name: label, exact: true })
      .click();
    await expect(backdrop).toHaveAttribute(
      'src',
      /stadium-weather\/connacht-rugby\/night-dry\.webp/,
    );
  }
  await page.goBack();
  await expect(backdrop).toHaveAttribute('src', /stadium-weather\/connacht-rugby\/night-dry\.webp/);
  expect(await page.locator('.page-backdrop img').count()).toBeLessThanOrEqual(2);
  // Round 02 takes them to the Hive Stadium on a Friday night.
  await page.goto('/piele/duties?round=2');
  await expect(backdrop).toHaveAttribute(
    'src',
    /stadium-weather\/edinburgh-rugby\/night-dry\.webp/,
  );
});

test('profile artwork previews unsaved team choices and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/piele/profile?round=1');
  const backdrop = page.locator('.poster-photo img.visible');
  // The poster stays at the club's own ground: after dark in Cape Town at the away kickoff.
  await expect(backdrop).toHaveAttribute('src', /stadium-weather\/dhl-stormers\/night-dry\.webp/);
  await page.getByRole('radio', { name: 'Munster Rugby', exact: true }).check();
  // Munster host Glasgow in the late afternoon.
  await expect(backdrop).toHaveAttribute('src', /stadium-weather\/munster-rugby\/sunny-day\.webp/);
  await expect(backdrop).toHaveCSS('transition-duration', '0s');
  await page.getByRole('radio', { name: 'Vodacom Bulls', exact: true }).check();
  await page.getByRole('radio', { name: 'Glasgow Warriors', exact: true }).check();
  // Glasgow are away at Thomond Park; it is still light at Scotstoun at that kickoff.
  await expect(backdrop).toHaveAttribute(
    'src',
    /stadium-weather\/glasgow-warriors\/sunny-day\.webp/,
  );
  await page.getByRole('button', { name: 'Cancel profile changes' }).click();
  await expect(page.locator('.header-profile')).toContainText('Stormers');
  await page.goto('/piele/profile?round=1');
  await expect(backdrop).toHaveAttribute('src', /stadium-weather\/dhl-stormers\/night-dry\.webp/);
  await page.getByRole('radio', { name: 'Munster Rugby', exact: true }).check();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('link', { name: 'Duties', exact: true })
    .click();
  await expect(page.locator('.page-backdrop img.visible')).toHaveAttribute(
    'src',
    /stadium-weather\/munster-rugby\/sunny-day\.webp/,
  );
  await page.setViewportSize({ width: 320, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a forecast that arrives late changes the scene without holding the match hero', async ({
  page,
}) => {
  let release!: () => void;
  const forecastSent = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/v1/competitions/*/rounds/*/weather', async (route) => {
    await forecastSent;
    await route.fulfill({
      json: {
        round: 1,
        generatedAt: '2026-09-20T10:00:00Z',
        matches: [
          {
            fixtureId: CONNACHT_STORMERS,
            status: 'ok',
            weatherCode: 63,
            isDay: false,
            forecastHourUtc: '2026-09-25T19:00:00Z',
          },
        ],
      },
    });
  });
  await page.goto('/piele?round=1');
  const backdrop = page.locator('.page-backdrop img.visible');
  const hero = page.locator('app-match-hero .score-bug');
  await expect(backdrop).toHaveAttribute('src', /stadium-weather\/connacht-rugby\/night-dry\.webp/);
  release();
  await expect(backdrop).toHaveAttribute(
    'src',
    /stadium-weather\/connacht-rugby\/rainy-night\.webp/,
  );
  const ribbon = page.getByRole('group', { name: 'Round 01 fixtures' });
  await ribbon.getByRole('button', { name: /Benetton.*Dragons/ }).click();
  await expect(hero).toContainText('Benetton');
  await expect(backdrop).toHaveAttribute('src', /stadium-weather\/benetton-rugby\/night-dry\.webp/);
  await ribbon.getByRole('button', { name: /Connacht.*Stormers/ }).click();
  await expect(hero).toContainText('Connacht');
  await expect(backdrop).toHaveAttribute(
    'src',
    /stadium-weather\/connacht-rugby\/rainy-night\.webp/,
  );
  // The profile poster uses the forecast only for a fixture at the club's own ground.
  await page.goto('/piele/profile?round=1');
  const poster = page.locator('.poster-photo img.visible');
  await expect(poster).toHaveAttribute('src', /stadium-weather\/dhl-stormers\/night-dry\.webp/);
  await page.getByRole('radio', { name: 'Connacht Rugby', exact: true }).check();
  await expect(poster).toHaveAttribute('src', /stadium-weather\/connacht-rugby\/rainy-night\.webp/);
});

test('on a phone the artwork runs to the end of a short page and fades out on a long one', async ({
  page,
}) => {
  // The room under the content for the fixed bottom navigation belongs to the content, and
  // the content fills the screen on its own, so the backdrop (which covers the content) does
  // not stop at the footer with a strip of plain paper under it. Past 1500 px it fades into
  // the paper, as on Home.
  await page.setViewportSize({ width: 390, height: 664 });
  const geometry = () =>
    page.evaluate(() => {
      const bottom = (element: Element) => element.getBoundingClientRect().bottom + scrollY;
      const backdrop = document.querySelector('.page-backdrop')!;
      return {
        backdropTop: backdrop.getBoundingClientRect().top + scrollY,
        backdropBottom: bottom(backdrop),
        imageBottom: bottom(document.querySelector('.page-backdrop img.visible')!),
        footerBottom: bottom(document.querySelector('.club-footer')!),
        pageEnd: document.documentElement.scrollHeight,
        viewport: innerHeight,
      };
    });
  for (const path of ['/piele/decisions?round=1', '/piele/more?round=1', '/piele/duties?round=1']) {
    await page.goto(path);
    await expect(page.locator('.page-backdrop img.visible')).toBeVisible();
    await expect(page.locator('.page-loading')).toHaveCount(0);
    const size = await geometry();
    expect(
      size.backdropBottom - size.backdropTop,
      `${path} fills the screen`,
    ).toBeGreaterThanOrEqual(size.viewport - 64 - 1);
    expect(
      Math.abs(size.backdropBottom - size.pageEnd),
      `${path} reaches the page's end`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(size.imageBottom - size.pageEnd),
      `${path} image reaches the page's end`,
    ).toBeLessThanOrEqual(1);
    expect(
      size.pageEnd - size.footerBottom,
      `${path} clears the bottom navigation`,
    ).toBeGreaterThan(60);
  }
  await page.goto('/piele?round=1');
  await expect(page.locator('.page-backdrop img.visible')).toBeVisible();
  await expect(page.locator('app-feed .feed-item').first()).toBeVisible();
  const home = await geometry();
  expect(home.pageEnd).toBeGreaterThan(home.backdropTop + 1500);
  expect(home.backdropBottom - home.backdropTop).toBe(1500);
});
