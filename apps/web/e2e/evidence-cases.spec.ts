import { test, expect } from '@playwright/test';
import { chooseOption, openSection, seedProfile } from './support';

// Sample Piele: Johan vetoed Liam's Round 02 evidence (PieterW accepted); the sample member
// captains the league and votes. In the Pofadder Bowl the sample member is a plain voter.

test.beforeEach(async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'pofadder-bowl'] });
});

test('a dismissed veto reopens voting; the captain’s own veto waits for another reviewer', async ({
  page,
}) => {
  await page.goto('/piele?round=2');
  await page.getByRole('link', { name: /A veto awaits your ruling/ }).click();
  await expect(page).toHaveURL(/\/piele\/captain\?round=2/);

  const nav = page.getByRole('navigation', { name: 'League navigation', exact: true });
  await nav.getByRole('link', { name: 'Decisions', exact: true }).click();
  await expect(page).toHaveURL(/\/piele\/decisions\?round=2/);
  const card = page.locator('app-case-card').filter({ hasText: 'Round 02 Pick confirmation' });
  await expect(card).toContainText('IN REVIEW');
  await expect(card).toContainText('2 of 5 members responded');
  await expect(card).toContainText('The recording shows the Round 01 picks, not Round 02.');
  // Nobody's ballot is named: not the member who vetoed, nor the one who accepted.
  await expect(card).not.toContainText('Johan');
  await expect(card).not.toContainText('PieterW');

  await card.getByRole('button', { name: 'Dismiss veto' }).click();
  const dismiss = page.getByRole('dialog').filter({ hasText: 'Dismiss this veto?' });
  await dismiss.getByLabel('Reason').fill('Round 02 is visible at 0:40.');
  await dismiss.getByRole('button', { name: 'Dismiss veto' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Veto dismissed.' })).toBeVisible();
  await expect(card).toContainText('VOTING OPEN');
  await expect(card).toContainText(/\d+ h \d+ min left/);

  await card.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(card).toContainText('3 of 5 members responded');
  await expect(card).toContainText('You accepted');
  await expect(card.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);

  // An accept can still become a veto, which needs a reason and cannot be withdrawn.
  await card.getByRole('button', { name: 'Veto', exact: true }).click();
  const veto = page.getByRole('dialog').filter({ hasText: 'Veto this evidence?' });
  await veto.getByRole('button', { name: 'Veto evidence' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Give a reason' })).toBeVisible();
  await expect(veto.getByLabel('Reason')).toHaveAttribute('aria-invalid', 'true');
  await veto.getByLabel('Reason').fill('Still the Round 01 page.');
  await veto.getByRole('button', { name: 'Veto evidence' }).click();
  await expect(card).toContainText('IN REVIEW');
  await expect(card).toContainText('You vetoed: “Still the Round 01 page.”');
  // The captain cannot rule on their own veto; nothing says who vetoed.
  await expect(card).toContainText('An uninvolved reviewer will rule on it.');
  await expect(card).not.toContainText('NEEDS AN UNINVOLVED REVIEWER');
  await expect(card.getByRole('button', { name: 'Uphold veto' })).toHaveCount(0);

  // The captain names a stand-in, who may rule on the captain's own veto.
  await nav.getByRole('link', { name: 'More', exact: true }).click();
  await page.getByRole('link', { name: "Round 02 captain's desk" }).click();
  await openSection(page, 'Evidence to decide.');
  const queue = page.locator('app-evidence-review app-case-card');
  await expect(queue).toHaveCount(0);
  await openSection(page, 'The stand-in reviewer.');
  await chooseOption(page.getByRole('combobox', { name: 'Stand-in reviewer' }), {
    label: 'Franco',
  });
  await page.getByRole('button', { name: 'Save stand-in' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Franco is the stand-in reviewer.' }),
  ).toBeVisible();
  await expect(queue).toHaveCount(0);
  const override = page.locator('.review-row').filter({ hasText: 'Liam' });
  await expect(override).toContainText('Vetoed: waiting for a ruling');

  await nav.getByRole('link', { name: 'Duties', exact: true }).click();
  await page.getByRole('button', { name: 'League duties', exact: true }).click();
  const duty = page.locator('.register-card').filter({ hasText: 'Liam' });
  await expect(duty).toContainText('Under review');
  await expect(duty).toContainText('Vetoed: an uninvolved reviewer will rule');
});

test('an upheld veto rejects the evidence and leaves the duty open', async ({ page }) => {
  await page.goto('/piele/decisions?round=2');
  const card = page.locator('app-case-card').filter({ hasText: 'Round 02 Pick confirmation' });
  await card.getByRole('button', { name: 'Uphold veto' }).click();
  const uphold = page.getByRole('dialog').filter({ hasText: 'Uphold this veto?' });
  await uphold.getByLabel('Reason').fill('The recording shows the wrong round.');
  await uphold.getByRole('button', { name: 'Uphold veto' }).click();
  await expect(card).toContainText('REJECTED');
  await expect(card).toContainText('Rejected: the veto was upheld');

  const nav = page.getByRole('navigation', { name: 'League navigation', exact: true });
  await nav.getByRole('link', { name: 'Duties', exact: true }).click();
  await page.getByRole('button', { name: 'League duties', exact: true }).click();
  const duty = page.locator('.register-card').filter({ hasText: 'Liam' });
  await expect(duty).toContainText('Rejected · submit again');
  await expect(duty.getByRole('link', { name: 'View the veto' })).toHaveCount(0);
});

test('a member accepts evidence under the league’s vote', async ({ page }) => {
  await page.goto('/pofadder-bowl?round=2');
  await page.getByRole('link', { name: /Evidence awaits your vote/ }).click();
  await expect(page).toHaveURL(/\/pofadder-bowl\/decisions\?round=2/);
  const card = page.locator('app-case-card').filter({ hasText: 'Thabo' });
  await expect(card).toContainText('VOTING OPEN');
  // Riaan has not claimed his name, so four members vote.
  await expect(card).toContainText('1 of 4 members responded');
  await expect(card).toContainText('Not yet');
  await card.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(card).toContainText('2 of 4 members responded');
  await expect(card).toContainText('You accepted');
  // Two of four is no majority: voting stays open until it closes.
  await expect(card).toContainText('VOTING OPEN');

  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
