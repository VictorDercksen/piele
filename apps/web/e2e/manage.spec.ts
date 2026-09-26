import { expect, Page, test } from '@playwright/test';
import { seedProfile } from './support';

// The management centre in the sample build. The sample account is the admin; `?sampleAdmin=0`
// on the first page makes it a plain member. Sample changes live in memory, so each journey
// stays inside the app after its first page load.

function card(page: Page, name: string) {
  return page.locator('app-league-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
}

async function openSwitcher(page: Page) {
  const trigger = page.locator('.rail-brand .switcher-trigger');
  await trigger.click();
  const sheet = page.locator('.rail-brand').getByRole('dialog', { name: 'Switch league' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('the switcher ends with "Manage leagues", which lists the sample leagues', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/piele');
  const sheet = await openSwitcher(page);
  const manage = sheet.getByRole('link', { name: 'Manage leagues' });
  await expect(manage).toBeVisible();
  await manage.click();
  await expect(page).toHaveURL(/\/manage$/);
  await expect(page).toHaveTitle('Manage leagues · The Pavilion');
  await expect(page.getByRole('heading', { name: 'Manage leagues.', level: 1 })).toBeVisible();

  const active = page.getByRole('list', { name: 'Active leagues' });
  await expect(active.getByRole('heading', { level: 3 })).toHaveText([
    'Piele',
    'Pofadder Bowl',
    'Sample Third XV',
  ]);
  const pofadder = card(page, 'Pofadder Bowl');
  await expect(pofadder).toContainText('/pofadder-bowl');
  await expect(pofadder).toContainText('URC · URC 2026/27');
  await expect(pofadder).toContainText('Doempie');
  await expect(pofadder).toContainText('6 · 5 claimed · 6 in season · 0 withdrawn');
  await expect(pofadder).toContainText('b0e1d2c3a4f5');
  await expect(pofadder.getByText('Active', { exact: true })).toBeVisible();
  // The admin is already a member of Piele and the Pofadder Bowl, not of the Sample Third XV.
  await expect(pofadder.getByRole('button', { name: 'Add me to Pofadder Bowl' })).toHaveCount(0);
  await expect(card(page, 'Sample Third XV').getByRole('button', { name: 'Add me to Sample Third XV' })).toBeVisible();

  await card(page, 'Sample Third XV').getByRole('link', { name: 'Open Sample Third XV' }).click();
  await expect(page).toHaveURL(/\/sample-third$/);
});

test('creating a league adds it to the switcher and opens it', async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'die-ou-manne'] });
  await page.goto('/manage');
  const form = page.locator('app-create-league-form');
  await form.getByLabel('League name').fill('Die Ou Manne');
  await expect(form.getByLabel('Slug')).toHaveValue('die-ou-manne');
  await expect(form.getByLabel('Competition')).toHaveValue('urc-2026-27');
  await expect(form.getByLabel('Time zone')).toHaveValue('Africa/Johannesburg');
  await expect(form.getByLabel('Season name')).toHaveValue('URC 2026/27');

  // A line without a comma is shown with its number and stops the form.
  const members = form.getByRole('textbox', { name: 'Members (one per line)' });
  await members.fill('Steyn, Doempie, Doempie\nKallie\nThabo Nkosi, Thabo');
  await expect(form.locator('.line-errors')).toContainText('Line 2');
  await expect(form.locator('.preview-count')).toHaveText('2 members ready, 1 line to fix.');
  await members.fill('Steyn, Doempie, Doempie\nKallie Kruger, Kallie\nThabo Nkosi, Thabo\nVictor Dercksen, Vic');
  await expect(form.locator('.preview-count')).toHaveText('4 members ready.');
  await expect(form.locator('.member-preview li')).toHaveCount(4);
  await form.getByLabel('Captain', { exact: true }).selectOption('Vic');
  await expect(form.getByLabel('The captain is me')).toBeChecked();
  await form.getByRole('radio', { name: 'Lantern' }).check();
  await form.getByLabel('Accent colour').fill('#3f8f6b');
  await expect(form.locator('.look-preview use')).toHaveAttribute(
    'href',
    'assets/images/emblems/lantern.svg#emblem',
  );

  await form.getByRole('button', { name: 'Create league' }).click();
  await expect(page).toHaveURL(/\/die-ou-manne$/);
  const rail = page.locator('.rail-brand .switcher-trigger');
  await expect(rail.locator('strong')).toHaveText('DIE OU MANNE');
  await expect(rail.locator('use')).toHaveAttribute('href', 'assets/images/emblems/lantern.svg#emblem');
  const feed = page.locator('app-feed');
  await feed.getByRole('button', { name: 'Season' }).click();
  await expect(feed).toContainText('4 members enrolled. Vic is captain.');
  const sheet = await openSwitcher(page);
  await expect(
    sheet.getByRole('list', { name: 'Your leagues' }).getByRole('link', { name: /Die Ou Manne/ }),
  ).toContainText('Captain');
});

test('the form explains a taken slug beside the slug field', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/manage');
  const form = page.locator('app-create-league-form');
  await form.getByLabel('League name').fill('Piele');
  await form.getByRole('textbox', { name: 'Members (one per line)' }).fill('Victor Dercksen, Vic');
  await form.getByLabel('Captain', { exact: true }).selectOption('Vic');
  await form.getByRole('button', { name: 'Create league' }).click();
  const slug = form.getByLabel('Slug');
  await expect(slug).toHaveAttribute('aria-invalid', 'true');
  await expect(slug).toBeFocused();
  await expect(form.locator('#new-league-slug-error')).toContainText('Another league already uses piele');

  await slug.fill('manage');
  await expect(form.locator('#new-league-slug-error')).toContainText('app’s own paths');
});

test('archiving a league takes it out of the switcher; restoring brings it back', async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'pofadder-bowl'] });
  await page.goto('/manage');
  const pofadder = card(page, 'Pofadder Bowl');
  const archive = pofadder.getByRole('button', { name: 'Archive Pofadder Bowl' });
  await archive.click();
  const dialog = page.getByRole('dialog', { name: 'Archive Pofadder Bowl?' });
  await expect(dialog).toContainText('Nothing is deleted');
  // Closing without archiving gives focus back to the button.
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(archive).toBeFocused();
  await archive.click();
  await dialog.getByRole('button', { name: 'Archive' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').first()).toHaveText('Pofadder Bowl is archived.');

  const archived = page.locator('details.archived-group');
  await expect(archived.locator('summary')).toBeFocused();
  await expect(archived.locator('summary')).toContainText('Archived 1');
  await expect(page.getByRole('list', { name: 'Active leagues' })).not.toContainText('Pofadder Bowl');
  await archived.locator('summary').click();
  await expect(card(page, 'Pofadder Bowl').getByText('Archived', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Back to the clubhouse' }).click();
  await expect(page).toHaveURL(/\/piele$/);
  let sheet = await openSwitcher(page);
  await expect(sheet).not.toContainText('Pofadder Bowl');
  await sheet.getByRole('link', { name: 'Manage leagues' }).click();

  await page.locator('details.archived-group summary').click();
  await card(page, 'Pofadder Bowl').getByRole('button', { name: 'Restore Pofadder Bowl' }).click();
  await page.getByRole('dialog', { name: 'Restore Pofadder Bowl?' }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('details.archived-group')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pofadder Bowl', level: 3 })).toBeFocused();
  await page.getByRole('link', { name: 'Back to the clubhouse' }).click();
  sheet = await openSwitcher(page);
  await expect(sheet).toContainText('Pofadder Bowl');
});

test('rename, add me and appoint a captain from a league’s card', async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'pofadder-bowl'] });
  await page.goto('/manage');
  const third = card(page, 'Sample Third XV');
  await third.getByRole('button', { name: 'Add me to Sample Third XV' }).click();
  await expect(page.getByRole('status').first()).toContainText('You are a member of Sample Third XV');
  await expect(third.getByRole('button', { name: /Add me/ })).toHaveCount(0);

  const pofadder = card(page, 'Pofadder Bowl');
  const rename = pofadder.getByRole('button', { name: 'Rename Pofadder Bowl' });
  await rename.click();
  const name = pofadder.getByLabel('League name');
  await expect(name).toBeFocused();
  await pofadder.getByLabel('Time zone').fill('Nowhere/Special');
  await pofadder.getByRole('button', { name: 'Save' }).click();
  await expect(pofadder.getByRole('alert')).toContainText('IANA time zone');
  await pofadder.getByLabel('Time zone').fill('Europe/London');
  await name.fill('Pofadder Cup');
  await pofadder.getByRole('button', { name: 'Save' }).click();
  const cup = card(page, 'Pofadder Cup');
  await expect(cup).toContainText('Europe/London');
  await expect(cup.getByRole('button', { name: 'Rename Pofadder Cup' })).toBeFocused();

  await cup.locator('summary', { hasText: 'Appoint a captain' }).click();
  const captain = cup.getByLabel('New captain');
  await expect(captain.locator('option')).toHaveText(['Choose a claimed member', 'Kallie', 'You', 'Sanet', 'Thabo']);
  await captain.selectOption({ label: 'Kallie' });
  await cup.getByRole('button', { name: 'Appoint', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Make Kallie captain?' });
  await expect(dialog).toContainText('from Doempie');
  await dialog.getByRole('button', { name: 'Appoint captain' }).click();
  await expect(dialog).toBeHidden();
  await expect(cup.locator('.facts')).toContainText('Kallie');
  await expect(page.getByRole('status').first()).toHaveText('Kallie is captain of Pofadder Cup.');

  await cup.getByRole('link', { name: 'Open Pofadder Cup' }).click();
  await expect(page).toHaveURL(/\/pofadder-bowl$/);
  const feed = page.locator('app-feed');
  await feed.getByRole('button', { name: 'Season' }).click();
  await expect(feed).toContainText('Kallie is captain.');
});

test('a member who is not the admin cannot open the management centre', async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'pofadder-bowl'] });
  await page.goto('/manage?sampleAdmin=0');
  await expect(page).toHaveURL(/\/piele$/);
  const sheet = await openSwitcher(page);
  await expect(sheet.getByRole('link', { name: 'Manage leagues' })).toHaveCount(0);
  await expect(sheet).not.toContainText('Sample Third XV');
  await expect(sheet.getByRole('link', { name: /Pofadder Bowl/ })).toBeVisible();
});

test('the management centre fits a 320 px phone', async ({ page }) => {
  await seedProfile(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/manage');
  await expect(page.getByRole('heading', { name: 'Manage leagues.', level: 1 })).toBeVisible();
  await card(page, 'Piele').getByRole('button', { name: 'Rename Piele' }).click();
  await card(page, 'Piele').locator('summary', { hasText: 'Appoint a captain' }).click();
  await page
    .locator('app-create-league-form')
    .getByRole('textbox', { name: 'Members (one per line)' })
    .fill('Kallie Kruger, Kallie\nno comma');
  await expect(page.locator('.line-errors')).toContainText('Line 2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
