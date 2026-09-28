import { expect, Page, test } from '@playwright/test';
import { chooseOption, seedProfile } from './support';

// The management centre in the sample build. The sample account is the admin; `?sampleAdmin=0`
// on the first page makes it a plain member. Sample changes live in memory, so each journey
// stays inside the app after its first page load.

/** The alert card (warning or success, both `role="status"`) holding `text`; cards stack. */
function notice(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text });
}

function card(page: Page, name: string) {
  return page
    .locator('app-league-card')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

/** Opens a league's card to its details and actions. */
async function expand(page: Page, name: string) {
  const toggle = card(page, name).getByRole('button', { name: `Details of ${name}` });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return card(page, name);
}

/** Opens the new-league form. */
async function openCreate(page: Page) {
  const toggle = page.getByRole('button', { name: /Start a league/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return page.locator('app-create-league-form');
}

/** Fills row `row` (0-based) of the team sheet, adding rows as needed. */
async function member(page: Page, row: number, name: string, surname: string, superbru: string) {
  const form = page.locator('app-create-league-form');
  const rows = form.locator('.member-row');
  // One click at a time, each waiting for its row, so a slow render never adds two.
  for (let count = await rows.count(); count <= row; count++) {
    await form.getByRole('button', { name: 'Add member' }).click();
    await expect(rows).toHaveCount(count + 1);
  }
  await form.locator(`#new-league-member-${row}-name`).fill(name);
  await form.locator(`#new-league-member-${row}-surname`).fill(surname);
  await form.locator(`#new-league-member-${row}-superbru`).fill(superbru);
}

async function openSwitcher(page: Page) {
  const trigger = page.locator('.rail-brand .switcher-trigger');
  await trigger.click();
  const sheet = page.locator('.rail-brand').getByRole('dialog', { name: 'Switch league' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('the switcher ends with "Manage leagues", which lists the sample leagues', async ({
  page,
}) => {
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
  // Cards start closed: crest, name, slug and status.
  const pofadder = card(page, 'Pofadder Bowl');
  await expect(pofadder.locator('.card-body')).toBeHidden();
  await expect(pofadder).toContainText('/pofadder-bowl · URC · 6 members');
  await expand(page, 'Pofadder Bowl');
  await expect(pofadder).toContainText('URC · URC 2026/27');
  await expect(pofadder).toContainText('Doempie');
  await expect(pofadder).toContainText('6 · 5 claimed · 6 in season · 0 withdrawn');
  await expect(pofadder).toContainText('b0e1d2c3a4f5');
  await expect(pofadder.getByText('Active', { exact: true })).toBeVisible();
  // The admin is already a member of Piele and the Pofadder Bowl, not of the Sample Third XV.
  await expect(pofadder.getByRole('button', { name: 'Add me to Pofadder Bowl' })).toHaveCount(0);
  await expand(page, 'Sample Third XV');
  await expect(
    card(page, 'Sample Third XV').getByRole('button', { name: 'Add me to Sample Third XV' }),
  ).toBeVisible();

  await card(page, 'Sample Third XV').getByRole('link', { name: 'Open Sample Third XV' }).click();
  await expect(page).toHaveURL(/\/sample-third$/);
});

test('creating a league adds it to the switcher and opens it', async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'die-ou-manne'] });
  await page.goto('/manage');
  const form = await openCreate(page);
  await expect(form.getByLabel('League name')).toHaveAttribute('placeholder', 'Sample Name');
  await form.getByLabel('League name').fill('Die Ou Manne');
  await expect(form.getByLabel('Slug')).toHaveValue('die-ou-manne');
  await expect(form.getByLabel('Competition')).toHaveAttribute('data-value', 'urc-2026-27');
  await expect(form.getByLabel('Time zone')).toHaveAttribute('data-value', 'Africa/Johannesburg');
  await expect(form.getByLabel('Season name')).toHaveValue('URC 2026/27');

  // The time zone is chosen from the browser's IANA zones.
  await form.getByLabel('Time zone').click();
  await page.getByPlaceholder('Search time zones').fill('London');
  await expect(page.getByRole('option', { name: /London/ })).toHaveCount(1);
  await page.keyboard.press('Escape');

  // A row without a Superbru name is pointed out on submit, on a warning card, and stops the form.
  await expect(form.locator('.member-row')).toHaveCount(3);
  await member(page, 0, 'Doempie', 'Steyn', 'Doempie');
  await member(page, 1, 'Kallie', 'Kruger', '');
  await form.getByRole('button', { name: 'Create league' }).click();
  const warning = notice(page, 'Member 2: Add the Superbru name.');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Yellow card');
  await expect(warning).toContainText('Choose the captain from the members.');
  await expect(form.locator('#new-league-member-1-superbru')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(form.locator('#new-league-member-1-superbru')).toHaveClass(/problem-flag/);
  await expect(form.locator('#new-league-member-1-superbru')).not.toBeFocused();
  await expect(form.locator('.preview-count')).toHaveText('1 member ready, 1 row to fix.');
  await member(page, 1, 'Kallie', 'Kruger', 'Kallie');
  await member(page, 2, 'Thabo', 'Nkosi', 'Thabo');
  await member(page, 3, 'Victor', 'Dercksen', 'Vic');
  await expect(form.locator('.member-row')).toHaveCount(4);
  await expect(form.locator('.preview-count')).toHaveText('4 members ready.');
  await chooseOption(form.getByLabel('Captain', { exact: true }), 'Vic');
  await expect(form.getByLabel('The captain is me')).toBeChecked();
  await form.getByRole('radio', { name: 'Jersey' }).check();
  await form.getByLabel('Accent colour').fill('#3f8f6b');
  await expect(form.locator('.look-preview use')).toHaveAttribute(
    'href',
    'assets/images/emblems/jersey.svg#emblem',
  );

  await form.getByRole('button', { name: 'Create league' }).click();
  await expect(page).toHaveURL(/\/die-ou-manne$/);
  const rail = page.locator('.rail-brand .switcher-trigger');
  await expect(rail.locator('strong')).toHaveText('DIE OU MANNE');
  await expect(rail.locator('use')).toHaveAttribute(
    'href',
    'assets/images/emblems/jersey.svg#emblem',
  );
  const feed = page.locator('app-feed');
  await feed.getByRole('button', { name: 'Season' }).click();
  await expect(feed).toContainText('4 members enrolled. Vic is captain.');
  const sheet = await openSwitcher(page);
  await expect(
    sheet.getByRole('list', { name: 'Your leagues' }).getByRole('link', { name: /Die Ou Manne/ }),
  ).toContainText('Captain');
});

test('the form warns about a taken slug and highlights the slug field', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/manage');
  const form = await openCreate(page);
  await form.getByLabel('League name').fill('Piele');
  await member(page, 0, 'Victor', 'Dercksen', 'Vic');
  await chooseOption(form.getByLabel('Captain', { exact: true }), 'Vic');
  await form.getByRole('button', { name: 'Create league' }).click();
  const slug = form.getByLabel('Slug');
  await expect(slug).toHaveAttribute('aria-invalid', 'true');
  await expect(slug).toHaveClass(/problem-flag/);
  await expect(slug).not.toBeFocused();
  await expect(notice(page, 'Another league already uses piele')).toBeVisible();

  await slug.fill('manage');
  await expect(slug).toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('button', { name: 'Create league' }).click();
  // The new attempt's card replaces the last one.
  await expect(notice(page, 'app’s own paths')).toBeVisible();
  await expect(notice(page, 'Another league already uses piele')).toHaveCount(0);
  await expect(slug).toHaveClass(/problem-flag/);
  await expect(slug).not.toBeFocused();
});

test('archiving a league takes it out of the switcher; restoring brings it back', async ({
  page,
}) => {
  await seedProfile(page, { leagues: ['piele', 'pofadder-bowl'] });
  await page.goto('/manage');
  const pofadder = await expand(page, 'Pofadder Bowl');
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
  await expect(notice(page, 'Pofadder Bowl is archived.')).toBeVisible();

  const archived = page.locator('.archived-group');
  await expect(archived.locator('.disclosure-trigger')).toBeFocused();
  await expect(archived.locator('.disclosure-trigger')).toContainText('Archived 1');
  await expect(page.getByRole('list', { name: 'Active leagues' })).not.toContainText(
    'Pofadder Bowl',
  );
  await archived.locator('.disclosure-trigger').click();
  await expect(card(page, 'Pofadder Bowl').getByText('Archived', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Back to the clubhouse' }).click();
  await expect(page).toHaveURL(/\/piele$/);
  let sheet = await openSwitcher(page);
  await expect(sheet).not.toContainText('Pofadder Bowl');
  await sheet.getByRole('link', { name: 'Manage leagues' }).click();

  await page.locator('.archived-group .disclosure-trigger').click();
  await expand(page, 'Pofadder Bowl');
  await card(page, 'Pofadder Bowl').getByRole('button', { name: 'Restore Pofadder Bowl' }).click();
  await page
    .getByRole('dialog', { name: 'Restore Pofadder Bowl?' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(page.locator('.archived-group')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pofadder Bowl', level: 3 })).toBeFocused();
  await page.getByRole('link', { name: 'Back to the clubhouse' }).click();
  sheet = await openSwitcher(page);
  await expect(sheet).toContainText('Pofadder Bowl');
});

test('rename, add me and appoint a captain from a league’s card', async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'pofadder-bowl'] });
  await page.goto('/manage');
  const third = await expand(page, 'Sample Third XV');
  await third.getByRole('button', { name: 'Add me to Sample Third XV' }).click();
  await expect(notice(page, 'You are a member of Sample Third XV')).toBeVisible();
  await expect(third.getByRole('button', { name: /Add me/ })).toHaveCount(0);

  const pofadder = await expand(page, 'Pofadder Bowl');
  const rename = pofadder.getByRole('button', { name: 'Rename Pofadder Bowl' });
  await rename.click();
  const name = pofadder.getByLabel('League name');
  await expect(name).toBeFocused();
  await expect(pofadder.getByLabel('Time zone')).toHaveAttribute(
    'data-value',
    'Africa/Johannesburg',
  );
  await chooseOption(pofadder.getByLabel('Time zone'), 'Europe/London');
  // A blank name is warned about on a card, marked and highlighted.
  await name.fill('');
  await pofadder.getByRole('button', { name: 'Save' }).click();
  await expect(notice(page, 'Give the league a name.')).toBeVisible();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toHaveClass(/problem-flag/);
  await expect(name).not.toBeFocused();
  await name.fill('Pofadder Cup');
  await pofadder.getByRole('button', { name: 'Save' }).click();
  const cup = card(page, 'Pofadder Cup');
  await expect(cup).toContainText('Europe/London');
  await expect(cup.getByRole('button', { name: 'Rename Pofadder Cup' })).toBeFocused();

  // The join link copies from an icon button.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const copy = cup.getByRole('button', { name: 'Copy the join link of Pofadder Cup' });
  await expect(copy).toHaveText('');
  await copy.click();
  await expect(cup.locator('.copy-status')).toHaveText('Copied');

  await cup.locator('.disclosure-trigger', { hasText: 'Appoint a captain' }).click();
  const captain = cup.getByLabel('New captain');
  await captain.click();
  await expect(page.getByRole('option')).toHaveText(['Kallie', 'You', 'Sanet', 'Thabo']);
  await chooseOption(captain, { label: 'Kallie' });
  await cup.getByRole('button', { name: 'Appoint', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Make Kallie captain?' });
  await expect(dialog).toContainText('from Doempie');
  await dialog.getByRole('button', { name: 'Appoint captain' }).click();
  await expect(dialog).toBeHidden();
  await expect(cup.locator('.facts')).toContainText('Kallie');
  await expect(notice(page, 'Kallie is captain of Pofadder Cup.')).toBeVisible();

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
  await expand(page, 'Piele');
  await card(page, 'Piele').getByRole('button', { name: 'Rename Piele' }).click();
  await card(page, 'Piele')
    .locator('.disclosure-trigger', { hasText: 'Appoint a captain' })
    .click();
  const form = await openCreate(page);
  await member(page, 0, 'Kallie', 'Kruger', 'Kallie');
  await member(page, 3, 'No', 'Superbru', '');
  await form.getByRole('button', { name: 'Create league' }).click();
  await expect(notice(page, 'Member 4: Add the Superbru name.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
