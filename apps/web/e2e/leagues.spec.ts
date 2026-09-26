import { expect, test } from '@playwright/test';
import { seedProfile } from './support';

// The sample build's leagues: Piele (the sample member captains it), the Pofadder Bowl
// (Doempie captains it; the sample member plays) and the Sample Third XV (the sample account
// is the admin and holds no membership there).
const PIELE_JOIN_CODE = '5a3b1e0f9c2d';
const POFADDER_JOIN_CODE = 'b0e1d2c3a4f5';

test('/ opens the account’s league and unknown leagues fall back to it', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/?round=2');
  await expect(page).toHaveURL(/\/piele\?round=2$/);
  await expect(page).toHaveTitle('The Pavilion');
  const rail = page.locator('.rail-brand .switcher-trigger');
  await expect(rail.locator('strong')).toHaveText('PIELE');
  await expect(rail.locator('img')).toHaveAttribute('src', /piele-crest\.png/);
  await expect(page.locator('.club-footer')).toContainText('THE PAVILION / PIELE / ROUND 02');

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
  const rail = page.locator('.rail-brand .switcher-trigger');
  await expect(rail.locator('strong')).toHaveText('POFADDER BOWL');
  await expect(rail.locator('small')).toContainText('URC');
  await expect(rail.locator('use')).toHaveAttribute('href', 'assets/images/emblems/anvil.svg#emblem');
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
  // The sample member only plays here, but the sample account is the admin, so the captain's
  // desk opens (the API accepts the admin on every steward route).
  await expect(page.getByRole('link', { name: /captain's desk/ })).toBeVisible();
  await page.goto('/pofadder-bowl/captain');
  await expect(page).toHaveURL(/\/pofadder-bowl\/captain$/);
  await expect(page.locator('.admin-ribbon')).toHaveCount(0);

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
  await expect(page.locator('.league-heading use')).toHaveAttribute(
    'href',
    'assets/images/emblems/anvil.svg#emblem',
  );
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

test('the league switcher lists every league and opens the same page in another', async ({
  page,
}) => {
  await seedProfile(page, { leagues: ['piele', 'pofadder-bowl'] });
  await page.goto('/piele/standings?round=2');
  const trigger = page.locator('.rail-brand').getByRole('button', { name: 'Piele. Switch league' });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const sheet = page.getByRole('dialog', { name: 'Switch league' }).first();
  await expect(sheet).toBeVisible();
  const yours = sheet.getByRole('list', { name: 'Your leagues' });
  await expect(yours.getByRole('link')).toHaveText([/Piele.*Current.*Captain/, /Pofadder Bowl/]);
  await expect(yours.getByRole('link', { name: /Piele/ })).toHaveAttribute('aria-current', 'true');
  await expect(sheet.getByRole('list', { name: 'All leagues' })).toContainText('Sample Third XV');
  await expect(sheet.getByRole('list', { name: 'All leagues' })).toContainText('Admin view');
  await expect(sheet.getByLabel('Join link or code')).toBeVisible();

  // Escape closes it and gives focus back to the button.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await sheet.getByRole('link', { name: /Pofadder Bowl/ }).click();
  await expect(page).toHaveURL(/\/pofadder-bowl\/standings\?round=2$/);
  await expect(page.locator('.standing-row').first()).toContainText('Kallie');
  await expect(page.locator('.rail-brand .brand-text strong')).toHaveText('POFADDER BOWL');
});

test('on a phone the switcher drops as a sheet and takes a join code', async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'pofadder-bowl'] });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/piele');
  const trigger = page.locator('.club-brand').getByRole('button', { name: 'Piele. Switch league' });
  await trigger.click();
  const sheet = page.locator('.club-brand').getByRole('dialog', { name: 'Switch league' });
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await sheet.getByLabel('Join link or code').fill(`https://pavilion.example/join/${POFADDER_JOIN_CODE}`);
  await sheet.getByRole('button', { name: 'Join' }).click();
  await expect(page).toHaveURL(new RegExp(`/join/${POFADDER_JOIN_CODE}$`));
});

test('the captain’s desk shows the join link, copies it, rotates it and closes joining', async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedProfile(page);
  await page.goto('/piele/captain');
  const card = page.locator('app-join-link-card');
  const link = card.getByLabel('Join link', { exact: true });
  await expect(link).toHaveValue(`${baseURL}/join/${PIELE_JOIN_CODE}`);
  await card.getByRole('button', { name: 'Copy link' }).click();
  await expect(card.locator('.copy-status')).toContainText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${baseURL}/join/${PIELE_JOIN_CODE}`,
  );

  await card.getByRole('button', { name: 'Rotate link' }).click();
  const dialog = page.getByRole('dialog', { name: 'Make a new join link?' });
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Make a new link' }).click();
  await expect(dialog).toBeHidden();
  await expect(link).not.toHaveValue(new RegExp(PIELE_JOIN_CODE));
  await expect(link).toHaveValue(/\/join\/[0-9a-f]{12}$/);

  await card.getByRole('button', { name: 'Close joining' }).click();
  await page.getByRole('dialog', { name: 'Close joining?' }).getByRole('button', { name: 'Close joining' }).click();
  await expect(card.getByRole('heading', { name: 'Joining is closed.' })).toBeVisible();
  await card.getByRole('button', { name: 'Open joining' }).click();
  await expect(card.getByLabel('Join link', { exact: true })).toHaveValue(/\/join\/[0-9a-f]{12}$/);
});

test('removing a member moves them to Withdrawn and reinstating brings them back', async ({
  page,
}) => {
  await seedProfile(page);
  await page.goto('/piele/captain');
  const sheet = page.locator('section.members > .member-list');
  await expect(sheet.locator('li')).toHaveCount(6);
  // The captain's own row has no Remove button.
  await expect(sheet.locator('li').filter({ hasText: 'You' }).getByRole('button', { name: /Remove/ })).toHaveCount(0);
  const remove = sheet.getByRole('button', { name: 'Remove Liam' });
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'Remove Liam?' });
  await expect(dialog).toContainText('open duties are voided');
  await expect(dialog).not.toContainText('will be deleted');
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Give a reason');
  await dialog.getByLabel('Reason').fill('Moved to Perth');
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(dialog).toBeHidden();
  await expect(sheet.locator('li')).toHaveCount(5);
  await expect(sheet).not.toContainText('Liam');

  const withdrawn = page.locator('details.withdrawn');
  await expect(withdrawn.locator('summary')).toContainText('Withdrawn');
  await expect(withdrawn.locator('summary')).toBeFocused();
  await withdrawn.locator('summary').click();
  await expect(withdrawn).toContainText('Liam');
  await expect(withdrawn).toContainText('Moved to Perth');
  await withdrawn.getByRole('button', { name: 'Reinstate Liam' }).click();
  await expect(withdrawn).toHaveCount(0);
  await expect(sheet.locator('li')).toHaveCount(6);
  await expect(sheet).toContainText('Liam');
});

test('the appearance card changes the league crest', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/piele/captain');
  const card = page.locator('app-appearance-card');
  const crest = page.locator('.rail-brand .switcher-trigger app-league-crest');
  await expect(crest.locator('img')).toHaveAttribute('src', /piele-crest\.png/);
  await card.getByRole('radio', { name: 'Crown' }).check();
  await card.getByLabel('Accent colour').fill('#3f8f6b');
  await card.getByRole('button', { name: 'Save appearance' }).click();
  await expect(crest.locator('use')).toHaveAttribute('href', 'assets/images/emblems/crown.svg#emblem');
  await expect(crest).toHaveCSS('color', 'rgb(63, 143, 107)');
  await expect(page.getByRole('status')).toContainText('new look');

  await card.getByRole('button', { name: 'Remove emblem' }).click();
  await card.getByRole('button', { name: 'Save appearance' }).click();
  await expect(crest.locator('img')).toHaveAttribute('src', /piele-crest\.png/);
});

test('the admin sees a league it is not in with the admin-view ribbon', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/sample-third');
  await expect(page).toHaveURL(/\/sample-third$/);
  await expect(page.locator('.admin-ribbon')).toHaveText(
    'Admin view. You are not a member of this league.',
  );
  await expect(page.locator('.rail-brand .switcher-trigger .monogram')).toHaveText('ST');
  // Captain actions stay open to the admin; what needs a membership says so.
  await page.goto('/sample-third/captain');
  await expect(page).toHaveURL(/\/sample-third\/captain$/);
  await expect(page.locator('.admin-ribbon')).toBeVisible();
});
