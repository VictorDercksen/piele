import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'piele-profile-v1',
      JSON.stringify({ displayName: 'Victor Dercksen', teamId: 'dhl-stormers', photo: null }),
    ),
  );
});

test('all published rounds, playoffs, timezone and selection persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?round=1');
  const jump = page.getByRole('combobox', { name: 'Jump to round' });
  await expect(jump.locator('option')).toHaveCount(21);
  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('button', { name: 'Rounds', exact: true })
    .click();
  for (let round = 1; round <= 21; round++) {
    await jump.selectOption(String(round));
    await expect(page.locator('.fixture-card')).toHaveCount(
      round <= 18 ? 8 : round === 19 ? 4 : round === 20 ? 2 : 1,
    );
    if (round > 18) {
      await expect(page.locator('.fixture-card').first()).toContainText('TBC');
      await expect(page.locator('.fixture-card').first()).toContainText('To be confirmed');
    }
  }
  await expect(page.getByRole('region', { name: 'Selected round' })).toContainText('Grand final');
  await page.reload();
  await expect(jump).toHaveValue('21');
  await jump.selectOption('2');
  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('button', { name: 'Rounds', exact: true })
    .click();
  await expect(page.locator('.fixture-card').filter({ hasText: 'Glasgow' })).toContainText('18:30');
  await jump.selectOption('15');
  await expect(page.locator('.fixture-card').filter({ hasText: 'Zebre' })).toContainText(
    'FRI 16 APR 2027',
  );
  await expect(page.locator('.fixture-card').filter({ hasText: 'Zebre' })).toContainText('19:30');
  await jump.selectOption('8');
  await expect(page.getByRole('region', { name: 'Selected round' })).toContainText('2027');
  await expect(page.locator('.fixture-card').filter({ hasText: 'Lions' })).toContainText(
    'FEB 2027',
  );
  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('button', { name: 'Standings', exact: true })
    .click();
  await expect(page.locator('.standing-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Current round' }).click();
  await expect(jump).toHaveValue('1');
  expect(errors).toEqual([]);
});

test('keyboard timeline and playoff layout on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/?round=18');
  const timeline = page.getByRole('navigation', { name: 'Season timeline' });
  const round18 = timeline.getByRole('button', { name: 'Round 18, Upcoming', exact: true });
  await round18.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('combobox', { name: 'Jump to round' })).toHaveValue('19');
  await expect(
    timeline.getByRole('button', { name: 'Quarter-finals, Upcoming', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('combobox', { name: 'Jump to round' })).toHaveValue('21');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('navigation', { name: 'Mobile league navigation' })
    .getByRole('button', { name: 'Rounds', exact: true })
    .click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('personal styling applies to the member row and duties in the sample league', async ({
  page,
}) => {
  await page.goto('/?demo=1&round=2');
  const nav = page.getByRole('navigation', { name: 'League navigation', exact: true });
  await expect(page.locator('.duty-feature')).toContainText('Victor Dercksen');
  await page.getByRole('button', { name: 'Upload evidence', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'demo.mp4', mimeType: 'video/mp4', buffer: Buffer.from('demo') });
  await page.getByRole('button', { name: 'Simulate submission' }).click();
  await expect(page.getByRole('heading', { name: 'Over to the captain.' })).toBeVisible();
  await nav.getByRole('button', { name: 'Standings', exact: true }).click();
  await expect(page.locator('.standing-row.you img')).toHaveAttribute('src', /dhl-stormers/);
  await page.getByRole('combobox', { name: 'Jump to round' }).selectOption('3');
  await expect(page.locator('.standing-row')).toHaveCount(0);
});
