import { expect, test, Page } from '@playwright/test';

// Collects Content-Security-Policy violations reported by the page.
function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  return violations;
}

test('deep links load the production build without CSP violations', async ({ page }) => {
  const violations = watchCsp(page);
  const response = await page.goto('/duties?round=2');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  await expect(page).toHaveURL(/\/piele\/welcome\?returnUrl=%2Fpiele%2Fduties/);
  await expect(page.getByRole('radio')).toHaveCount(16);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).not.toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(() => document.fonts.check('16px "Titillium Web"'))).toBe(true);
  expect(violations).toEqual([]);
});

test('onboarding and a profile photo work under the CSP', async ({ page }) => {
  const violations = watchCsp(page);
  await page.goto('/');
  await page.getByLabel('Your name', { exact: true }).fill('Victor Dercksen');
  await page.getByRole('radio', { name: 'DHL Stormers', exact: true }).check();
  await page.getByRole('button', { name: 'Enter the clubhouse' }).click();
  await expect(page.locator('.league')).toBeVisible();
  await expect(page.getByText('Sample league records')).toHaveCount(0);
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  await page
    .locator('app-profile-editor input[type=file]')
    .setInputFiles('public/assets/images/piele-crest.png');
  await expect(page.getByAltText('Your selected profile photo')).toHaveAttribute(
    'src',
    /^data:image\/jpeg/,
  );
  expect(violations).toEqual([]);
});

test('missing assets return 404 instead of the app shell', async ({ request }) => {
  const response = await request.get('/assets/images/missing.png');
  expect(response.status()).toBe(404);
});
