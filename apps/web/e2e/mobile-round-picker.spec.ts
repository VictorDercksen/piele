import { expect, Page, test } from '@playwright/test';
import { seedProfile } from './support';

/** The round sheet's top edge in every frame for `ms`, while it is attached. */
function sheetTops(page: Page, ms: number): Promise<number[]> {
  return page.evaluate(
    (ms) =>
      new Promise<number[]>((resolve) => {
        const tops: number[] = [];
        const start = performance.now();
        const tick = () => {
          const sheet = document.querySelector('.round-sheet');
          if (sheet) tops.push(sheet.getBoundingClientRect().y);
          if (performance.now() - start < ms) requestAnimationFrame(tick);
          else resolve(tops);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

for (const width of [320, 768]) {
  test(`one mobile header and a bounded round sheet at ${width}px`, async ({ page }, testInfo) => {
    await seedProfile(page);
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/piele/duties?round=2&scope=league');
    const picker = page.getByRole('button', { name: 'Choose round, Round 02', exact: true });
    await expect(picker).toBeVisible();
    await expect(page.locator('.season-rail')).toBeHidden();
    await expect(page.locator('.round-bar')).toBeHidden();
    await expect(page.getByRole('link', { name: 'My profile', exact: true })).toBeVisible();
    expect(await page.locator('.top-bar').evaluate((el) => el.getBoundingClientRect().height)).toBe(
      64,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath('mobile-header.png') });

    const rising = sheetTops(page, 600);
    await picker.click();
    const sheet = page.getByRole('dialog', { name: 'Choose a round' });
    const selected = sheet.getByRole('button', { name: /^Round 02,/ });
    // The sheet slides up from below the viewport and settles on its bottom edge.
    const tops = await rising;
    const rest = await sheet
      .locator('.round-sheet')
      .evaluate((el) => innerHeight - el.offsetHeight);
    expect(tops[0]).toBeGreaterThan(rest + 50);
    expect(tops.some((top) => top > rest + 5 && top < 739)).toBe(true);
    expect(Math.abs(tops.at(-1)! - rest)).toBeLessThan(1);
    await expect(selected).toBeFocused();
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet).toContainText('Piele');
    // Chromium versions differ on the spaces around the en dash.
    await expect(sheet).toContainText(/2 ?– ?3 Oct/);
    const box = (await sheet.locator('.round-sheet').boundingBox())!;
    expect(Math.abs(box.y + box.height - 740)).toBeLessThan(1);
    expect(box.height).toBeLessThanOrEqual(740 * 0.85 + 1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath('round-sheet.png') });
    await sheet.getByRole('button', { name: /^Round 03,/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/round=3&scope=league/);
    const updated = page.getByRole('button', { name: 'Choose round, Round 03', exact: true });
    await expect(updated).toBeFocused();
    await page.reload();
    await expect(updated).toBeVisible();
    await updated.click();
    await expect(sheet.locator('.round-sheet')).toBeVisible();
    await expect
      .poll(() => sheet.locator('.round-sheet').evaluate((el) => el.getAnimations().length))
      .toBe(0);
    // Closing, it slides back down before the dialog is removed.
    const sinking = sheetTops(page, 500);
    await page.keyboard.press('Escape');
    expect(Math.max(...(await sinking))).toBeGreaterThan(rest + 50);
    await expect(sheet).toHaveCount(0);
    await expect(updated).toBeFocused();
  });
}

test('round sheet boundaries, current shortcut, focus trap and desktop transition', async ({
  page,
}) => {
  await seedProfile(page);
  await page.clock.setFixedTime(new Date('2026-09-20T10:00:00Z'));
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/piele/standings?round=1');
  const picker = page.getByRole('button', { name: /^Choose round,/ });
  await picker.click();
  const sheet = page.getByRole('dialog', { name: 'Choose a round' });
  await expect(sheet.getByRole('button', { name: 'Current round', exact: true })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Previous round', exact: true })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Next round', exact: true }).click();
  await expect(page).toHaveURL(/round=2/);
  await expect(sheet.getByRole('button', { name: 'Current round', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Previous round', exact: true }).click();
  await expect(page).toHaveURL(/round=1/);
  await sheet.getByRole('button', { name: /^Round 01,/ }).focus();
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/round=21/);
  await expect(sheet.getByRole('button', { name: 'Next round', exact: true })).toBeDisabled();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await sheet.getByRole('button', { name: 'Current round', exact: true }).click();
  await expect(page).toHaveURL(/round=1(?!\d)/);
  await expect(sheet).toHaveCount(0);
  await expect(picker).toBeFocused();
  await picker.click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect(sheet).toHaveCount(0);
  await expect(picker).toBeHidden();
  await expect(page.getByRole('region', { name: 'Selected round' })).toContainText('Round 01');
  await expect(page.getByRole('navigation', { name: 'Season timeline' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Current round', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next round', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Current round', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Current round', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Current round', exact: true })).toHaveCount(0);
});
