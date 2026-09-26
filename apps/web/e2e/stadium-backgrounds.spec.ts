import { expect, test } from '@playwright/test';
import { seedProfile } from './support';

test.beforeEach(async ({ page }) => {
  await seedProfile(page, { displayName: 'Stadium test' });
});

test('page artwork follows the match and returns to the favourite club on other pages', async ({
  page,
}) => {
  await page.goto('/piele?round=1');
  const backdrop = page.locator('.page-backdrop img.visible');
  await expect(backdrop).toHaveAttribute('src', /connacht-rugby\.webp/);
  await expect(page.locator('app-match-hero .stadium-background')).toHaveCount(0);
  await expect(page.locator('.match-story')).toHaveCSS('background-image', 'none');
  await page
    .getByRole('group', { name: 'Round 01 fixtures' })
    .getByRole('button', { name: /Benetton.*Dragons/ })
    .click();
  await expect(backdrop).toHaveAttribute('src', /benetton-rugby\.webp/);
  await expect(backdrop).toHaveCSS('transition-duration', '0.65s');
  await page.getByRole('button', { name: 'Enter the match centre' }).click();
  await expect(page).toHaveURL(/\/piele\/match\/292584/);
  await expect(page.locator('.scope-note')).toHaveCount(0);
  await expect(page.locator('.match-story')).toHaveCSS('background-image', 'none');
  await expect(backdrop).toHaveAttribute('src', /benetton-rugby\.webp/);
  for (const label of ['Duties', 'Standings', 'Decisions', 'More']) {
    await page
      .getByRole('navigation', { name: 'League navigation', exact: true })
      .getByRole('link', { name: label, exact: true })
      .click();
    await expect(backdrop).toHaveAttribute('src', /dhl-stormers\.webp/);
  }
  await page.goBack();
  await expect(backdrop).toHaveAttribute('src', /dhl-stormers\.webp/);
  expect(await page.locator('.page-backdrop img').count()).toBeLessThanOrEqual(2);
});

test('profile artwork previews unsaved team choices and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/piele/profile');
  const backdrop = page.locator('.poster-photo img.visible');
  await expect(backdrop).toHaveAttribute('src', /dhl-stormers\.webp/);
  await page.getByRole('radio', { name: 'Munster Rugby', exact: true }).check();
  await expect(backdrop).toHaveAttribute('src', /munster-rugby\.webp/);
  await expect(backdrop).toHaveCSS('transition-duration', '0s');
  await page.getByRole('radio', { name: 'Vodacom Bulls', exact: true }).check();
  await page.getByRole('radio', { name: 'Glasgow Warriors', exact: true }).check();
  await expect(backdrop).toHaveAttribute('src', /glasgow-warriors\.webp/);
  await page.getByRole('button', { name: 'Cancel profile changes' }).click();
  await expect(page.locator('.header-profile')).toContainText('Stormers');
  await page.goto('/piele/profile');
  await expect(backdrop).toHaveAttribute('src', /dhl-stormers\.webp/);
  await page.getByRole('radio', { name: 'Munster Rugby', exact: true }).check();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('link', { name: 'Duties', exact: true })
    .click();
  await expect(page.locator('.page-backdrop img.visible')).toHaveAttribute(
    'src',
    /munster-rugby\.webp/,
  );
  await page.setViewportSize({ width: 320, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
