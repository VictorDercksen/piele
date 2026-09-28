import { expect, Page, test } from '@playwright/test';
import { seedProfile } from './support';

test.beforeEach(async ({ page }) => {
  await seedProfile(page);
});

/** Submits the sample member's spoon duty evidence on the duties page: a success card follows. */
async function submitSampleEvidence(page: Page) {
  await page.goto('/piele/duties?round=2');
  await page.getByRole('button', { name: 'League duties', exact: true }).click();
  await page
    .locator('.register-card.spoon-duty')
    .getByRole('button', { name: 'Upload evidence', exact: true })
    .click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'The proof is in the video.' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'demo.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('demo'),
  });
  await dialog.getByRole('button', { name: 'Submit evidence' }).click();
  await expect(dialog).toBeHidden();
  return page.getByRole('status').filter({ hasText: 'Sample only' });
}

test('a success card follows the sample evidence, leaves on its own and adds no scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const card = await submitSampleEvidence(page);
  await expect(card).toBeVisible();
  await expect(card.locator('.eyebrow')).toHaveText('Try');
  await expect(card).toContainText(
    'Sample only: Evidence submitted for review. No file was uploaded.',
  );
  await expect(card.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  // Once drawn, it sits at the foot of the screen, clear of the fixed mobile navigation.
  await card.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const box = (await card.boundingBox())!;
  const nav = (await page.locator('.mobile-nav').boundingBox())!;
  expect(Math.round(nav.y - (box.y + box.height))).toBe(16);
  expect(Math.round(box.x)).toBe(16);
  expect(Math.round(box.width)).toBe(390 - 32);

  // Success cards leave after 5 s, unless the pointer rests on them (the submit button was
  // where the card now is).
  await page.mouse.move(200, 100);
  await expect(card).toHaveCount(0, { timeout: 6500 });
  // The hidden stack is not rendered, so the page still ends where its content ends.
  await expect(page.locator('.snack')).toBeHidden();
  const excess = await page.evaluate(() => {
    const nav = document.querySelector('.mobile-nav')!;
    const footer = document.querySelector('.club-footer')!.getBoundingClientRect().bottom;
    const end = Math.max(
      innerHeight,
      footer +
        scrollY +
        nav.getBoundingClientRect().height +
        parseFloat(getComputedStyle(nav).bottom),
    );
    return document.documentElement.scrollHeight - end;
  });
  expect(Math.abs(excess)).toBeLessThanOrEqual(1);
});

test('a card stays above a modal dialog opened after it, and can be dismissed there', async ({
  page,
}) => {
  const card = await submitSampleEvidence(page);
  // The pointer on the card holds its clock; the keyboard opens the next dialog.
  await card.hover();
  await page
    .locator('.register-card:not(.spoon-duty)')
    .getByRole('button', { name: 'Record evidence', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog').filter({ hasText: 'Record the evidence.' });
  await expect(dialog).toBeVisible();
  const dismiss = card.getByRole('button', { name: 'Dismiss' });
  await expect(dismiss).toBeVisible();
  // Nothing (the modal's backdrop included) covers the dismiss button.
  await expect
    .poll(() =>
      dismiss.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !!hit && button.contains(hit);
      }),
    )
    .toBe(true);
  await dismiss.click();
  await expect(card).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Out of the closed dialog again, ready for the next card.
  await expect(page.locator('app-alert-snack > .snack')).toHaveCount(1);
});
