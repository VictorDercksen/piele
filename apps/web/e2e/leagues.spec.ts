import { expect, test } from '@playwright/test';
import { seedProfile } from './support';

// The sample build's leagues: Piele (the sample member captains it) and the Pofadder Bowl
// (Doempie captains it; the sample member plays).
const PIELE_JOIN_CODE = '5a3b1e0f9c2d';
const POFADDER_JOIN_CODE = 'b0e1d2c3a4f5';

test('/ opens the account’s league and unknown leagues fall back to it', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/?round=2');
  await expect(page).toHaveURL(/\/piele\?round=2$/);
  await expect(page).toHaveTitle('The Pavilion');
  const rail = page.locator('.rail-brand');
  await expect(rail.locator('strong')).toHaveText('PIELE');
  await expect(rail.locator('img')).toHaveAttribute('src', /piele-crest\.png/);
  await expect(page.locator('.club-footer')).toContainText('PIELE / ROUND 02');

  await page.goto('/nowhere');
  await expect(page).toHaveURL(/\/piele$/);
});

test('bookmarks from before league slugs open the same page in the league', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/standings?round=3');
  await expect(page).toHaveURL(/\/piele\/standings\?round=3$/);
  await expect(page).toHaveTitle('Standings · The Pavilion');
  await expect(page.getByRole('heading', { name: 'The pecking order.' })).toBeVisible();
  await page.goto('/match/292584?round=1');
  await expect(page).toHaveURL(/\/piele\/match\/292584\?round=1$/);
});

test('the Pofadder Bowl shows its own name, captain, standings and feed', async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'pofadder-bowl'] });
  await page.goto('/pofadder-bowl?round=2');
  const rail = page.locator('.rail-brand');
  await expect(rail.locator('strong')).toHaveText('POFADDER BOWL');
  await expect(rail.locator('small')).toContainText('URC');
  await expect(rail.locator('.monogram')).toHaveText('PB');
  await expect(page.locator('.club-footer')).toContainText('POFADDER BOWL / ROUND 02');
  const feed = page.locator('app-feed');
  await expect(feed).toContainText('Thabo: Round 02 Spoon duty.');
  await expect(feed).not.toContainText('Liam');
  await feed.getByRole('button', { name: 'Season' }).click();
  await expect(feed.locator('.feed-item').last()).toContainText('Doempie is captain');

  const nav = page.getByRole('navigation', { name: 'League navigation', exact: true });
  await nav.getByRole('link', { name: 'Standings', exact: true }).click();
  await expect(page).toHaveURL(/\/pofadder-bowl\/standings\?round=2$/);
  await expect(page.locator('.standing-row').first()).toContainText('Kallie');

  await nav.getByRole('link', { name: 'More', exact: true }).click();
  await expect(page.locator('.league-line')).toContainText('Pofadder Bowl');
  await expect(page.locator('.league-line')).toContainText('Captain Doempie');
  // The sample member only plays here, so the captain's desk stays closed.
  await expect(page.getByRole('link', { name: /captain's desk/ })).toHaveCount(0);
  await page.goto('/pofadder-bowl/captain');
  await expect(page).toHaveURL(/\/pofadder-bowl$/);

  // Piele keeps its own records and captain.
  await page.goto('/piele/more');
  await expect(page.locator('.league-line')).toContainText('Captain Victor Dercksen');
  await expect(page.getByRole('link', { name: /captain's desk/ })).toBeVisible();
});

test('each league has its own favourite team; the name carries over', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/pofadder-bowl');
  await expect(page).toHaveURL(/\/pofadder-bowl\/welcome\?returnUrl=%2Fpofadder-bowl$/);
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Victor Dercksen');
  await expect(page.getByText('Your team in Pofadder Bowl.')).toBeVisible();
  await page.getByRole('radio', { name: 'Munster Rugby', exact: true }).check();
  await page.getByRole('button', { name: 'Enter the clubhouse' }).click();
  await expect(page).toHaveURL(/\/pofadder-bowl$/);
  await expect(page.locator('.header-profile')).toContainText('Munster supporter');
  await page.goto('/piele');
  await expect(page.locator('.header-profile')).toContainText('Stormers supporter');
});

test('a join link shows the sample league and its unclaimed names', async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'pofadder-bowl'] });
  await page.goto(`/join/${POFADDER_JOIN_CODE}`);
  await expect(page).toHaveTitle('Join a league · The Pavilion');
  await expect(page.locator('.eyebrow')).toContainText('POFADDER BOWL');
  await expect(page.locator('.league-heading .monogram')).toHaveText('PB');
  // The sample account is already in both sample leagues.
  await expect(page.getByRole('heading', { name: "You're in." })).toBeVisible();
  await expect(page.locator('.unclaimed-note')).toContainText('Riaan');
  await page.getByRole('link', { name: 'Open Pofadder Bowl' }).click();
  await expect(page).toHaveURL(/\/pofadder-bowl$/);

  await page.goto('/join/not-a-real-code');
  await expect(page.getByRole('heading', { name: 'That link does not work.' })).toBeVisible();
});

test('the no-league page takes a pasted join link', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/no-league');
  await expect(page.getByRole('heading', { name: 'No league yet.' })).toBeVisible();
  const field = page.getByLabel('Join link or code');
  await field.fill('not a code');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('alert')).toContainText('not a join link or code');
  await field.fill(`https://pavilion.example/join/${PIELE_JOIN_CODE}`);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page).toHaveURL(new RegExp(`/join/${PIELE_JOIN_CODE}$`));
  await expect(page.getByRole('heading', { name: "You're in." })).toBeVisible();
});
