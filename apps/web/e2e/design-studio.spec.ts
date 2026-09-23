import { expect, test, Page } from '@playwright/test';
async function join(page: Page, team = 'DHL Stormers') {
  await page.getByLabel('Your name', { exact: true }).fill('Victor Dercksen');
  await page.getByRole('radio', { name: team, exact: true }).check();
  await page.getByRole('button', { name: 'Enter the clubhouse' }).click();
  await expect(page.locator('.league.floodlights')).toBeVisible();
}

test('first visit requires a favourite team and saves a personal identity', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('radio')).toHaveCount(16);
  await page.getByRole('button', { name: 'Enter the clubhouse' }).click();
  await expect(page.getByText('Choose the team you support.')).toBeVisible();
  await expect(page.getByText('Enter your name to continue.')).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Victor Dercksen');
  await page.getByRole('radio', { name: 'DHL Stormers', exact: true }).check();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('onboarding-desktop.png'), fullPage: true });
  await join(page);
  await expect(page.locator('.supporter-profile')).toContainText('Stormers');
  await expect(page.locator('.score-bug')).toContainText('Connacht');
  await expect(page.locator('.score-bug')).toContainText('Stormers');
  await expect(page.locator('.score-bug img').first()).toHaveAttribute('src', /jerseys/);
  await page.reload();
  await expect(page.locator('.supporter-strip')).toContainText('Victor Dercksen');
  await expect(page.getByRole('heading', { name: 'Who do you back?' })).toHaveCount(0);
});

test('profile photo, replacement, removal and team changes persist', async ({ page }) => {
  await page.goto('/');
  await join(page);
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  const upload = page.locator('input[type=file]');
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
  await expect(page.locator('.supporter-strip')).toContainText('Munster');
  await expect(page.locator('.score-bug')).toContainText('Munster');
  await expect(page.locator('.supporter-strip .identity-avatar img')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.supporter-strip .identity-avatar img')).toHaveCount(1);
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await upload.setInputFiles('public/assets/images/teams/munster-rugby.png');
  await expect(page.getByAltText('Your selected profile photo')).toBeVisible();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.reload();
  await expect(page.locator('.supporter-strip .identity-avatar img')).toHaveCount(0);
  await expect(page.locator('.supporter-strip .identity-avatar')).toHaveText('V');
});

test('cancel preserves profile and failed storage reports a visible error', async ({ page }) => {
  await page.goto('/');
  await join(page);
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await page.getByRole('radio', { name: 'Munster Rugby', exact: true }).check();
  await page.getByRole('button', { name: 'Cancel profile changes' }).click();
  await expect(page.locator('.supporter-profile')).toContainText('Stormers');
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not save');
});

test('Floodlights layouts and jersey assets work from desktop to 320px', async ({
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
  for (const width of [1440, 1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const nav = page.getByRole('navigation', {
      name: width <= 768 ? 'Mobile league navigation' : 'League navigation',
      exact: true,
    });
    await nav.getByRole('button', { name: 'Rounds', exact: true }).click();
    await expect(page.locator('.fixture-card')).toHaveCount(8);
    expect(
      await page
        .locator('.fixture-card img')
        .evaluateAll((images) =>
          images.every(
            (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await nav.getByRole('button', { name: 'Home', exact: true }).click();
    if (width === 390) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath('floodlights-mobile.png'),
        fullPage: true,
      });
    }
  }
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 950 });
  await page.screenshot({ path: testInfo.outputPath('profile-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
