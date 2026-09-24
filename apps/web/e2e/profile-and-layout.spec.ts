import { expect, test, Page } from '@playwright/test';
async function join(page: Page, team = 'DHL Stormers') {
  await page.getByLabel('Your name', { exact: true }).fill('Victor Dercksen');
  await page.getByRole('radio', { name: team, exact: true }).check();
  await page.getByRole('button', { name: 'Enter the clubhouse' }).click();
  await expect(page.locator('.league')).toBeVisible();
}

test('first visit requires a favourite team and saves a personal identity', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole('radio')).toHaveCount(16);
  await page.getByRole('button', { name: 'Enter the clubhouse' }).click();
  await expect(page.getByText('Choose the team you support.')).toBeVisible();
  await expect(page.getByText('Enter your name to continue.')).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Victor Dercksen');
  await page.getByRole('radio', { name: 'DHL Stormers', exact: true }).check();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('onboarding-desktop.png'), fullPage: true });
  await join(page);
  await expect(page.locator('.header-profile')).toContainText('Stormers');
  await expect(page.locator('.header-profile')).toContainText('Stormers supporter');
  await expect(page.locator('.header-profile .profile-jersey')).toHaveAttribute(
    'src',
    /dhl-stormers/,
  );
  await expect(page.locator('.supporter-strip')).toHaveCount(0);
  await expect(page.locator('.score-bug')).toContainText('Connacht');
  await expect(page.locator('.score-bug')).toContainText('Stormers');
  await expect(page.locator('.score-bug .club-crest').first()).toHaveAttribute(
    'src',
    /club-banners\/connacht-rugby-crest/,
  );
  await expect(page.locator('.page-heading .eyebrow')).toHaveCount(0);
  await expect(page.locator('.scope-note')).toHaveCount(0);
  await expect(page.locator('.broadcast-cover')).toHaveCount(0);
  await expect(page.locator('.match-venue')).toContainText('Dexcom Stadium');
  await page.reload();
  await expect(page.locator('.header-profile')).toContainText('Victor Dercksen');
  await expect(page.getByRole('heading', { name: 'Who do you back?' })).toHaveCount(0);
});

test('profile photo, replacement, removal and team changes persist', async ({ page }) => {
  await page.goto('/');
  await join(page);
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  const upload = page.locator('app-profile-editor input[type=file]');
  await upload.setInputFiles({
    name: 'bad.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  });
  await expect(page.getByRole('alert')).toContainText('JPG, PNG or WebP');
  await upload.setInputFiles({
    name: 'bad.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByRole('alert')).toContainText('could not be opened');
  await upload.setInputFiles({
    name: 'large.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('alert')).toContainText('smaller than 5 MB');
  await upload.setInputFiles('public/assets/images/piele-crest.png');
  await expect(page.getByAltText('Your selected profile photo')).toHaveAttribute(
    'src',
    /^data:image\/jpeg/,
  );
  await page.getByRole('radio', { name: 'Munster Rugby', exact: true }).check();
  await page.getByLabel('Your name', { exact: true }).fill('Victor');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.locator('.header-profile')).toContainText('Munster');
  await expect(page.locator('.score-bug')).toContainText('Munster');
  await expect(page.locator('.header-profile .identity-avatar img')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.header-profile .identity-avatar img')).toHaveCount(1);
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  await upload.setInputFiles('public/assets/images/teams/munster-rugby.png');
  await expect(page.getByAltText('Your selected profile photo')).toBeVisible();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.reload();
  await expect(page.locator('.header-profile .identity-avatar img')).toHaveCount(0);
  await expect(page.locator('.header-profile .identity-avatar')).toHaveText('V');
});

test('cancel preserves profile and failed storage reports a visible error', async ({ page }) => {
  await page.goto('/');
  await join(page);
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  await page.getByRole('radio', { name: 'Munster Rugby', exact: true }).check();
  await page.getByRole('button', { name: 'Cancel profile changes' }).click();
  await expect(page.locator('.header-profile')).toContainText('Stormers');
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not save');
});

test('Floodlights layouts and club assets work from desktop to 320px', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?round=2');
  await join(page);
  await page.evaluate(() => document.fonts.ready);
  const heroBounds = await page.locator('app-match-hero').boundingBox();
  const standingsBounds = await page.locator('.standings-panel').boundingBox();
  expect(heroBounds!.y).toBeLessThan(standingsBounds!.y);
  await page.screenshot({ path: testInfo.outputPath('floodlights-desktop.png'), fullPage: true });
  for (const width of [1440, 1280, 1051, 900, 801, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator('.match-venue')).toBeVisible();
    await expect(page.locator('.club-crest')).toHaveCount(2);
    await expect
      .poll(() =>
        page
          .locator('.score-bug img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    const nav = page.getByRole('navigation', {
      name: width <= 768 ? 'Mobile league navigation' : 'League navigation',
      exact: true,
    });
    await expect(nav.getByRole('link', { name: 'Rounds', exact: true })).toHaveCount(0);
    await expect(page.locator('.fixture-ribbon button')).toHaveCount(8);
    expect(
      await page
        .locator('.fixture-ribbon img')
        .evaluateAll((images) =>
          images.every(
            (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await nav.getByRole('link', { name: 'Home', exact: true }).click();
    if (width === 390) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath('floodlights-mobile.png'),
        fullPage: true,
      });
    }
  }
  await page.getByRole('button', { name: 'Enter the match centre' }).click();
  await expect(page).toHaveURL(/\/match\/\d+\?round=2/);
  await expect(page.locator('.page-heading .eyebrow')).toContainText('ROUND 02 / MATCH CENTRE');
  await expect(page.locator('app-match-hero')).toContainText('Stormers');
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 950 });
  await page.screenshot({ path: testInfo.outputPath('profile-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
