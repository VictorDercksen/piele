import { expect, test } from '@playwright/test';
import { chooseOption, seedProfile } from './support';

test('team radios support keyboard selection and persist the selected team', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your name', { exact: true }).fill('Keyboard member');
  const radios = page.getByRole('radio');
  await radios.first().focus();
  await page.keyboard.press('Space');
  await expect(radios.first()).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(radios.nth(1)).toBeChecked();
  await expect(radios.nth(1)).toBeFocused();
  const team = await radios.nth(1).getAttribute('value');
  await page.getByRole('button', { name: 'Enter the clubhouse' }).click();
  await expect(page.locator('.league')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pavilion-team-v1:piele'))).toBe(team);
});

test('checkboxes, switches, and grouped selects keep their form values', async ({
  page,
}, testInfo) => {
  await seedProfile(page);
  await page.goto('/manage');
  await page.getByRole('button', { name: /Start a league/ }).click();
  const form = page.locator('app-create-league-form');
  const captain = form.getByRole('checkbox', { name: /The captain is me/ });
  await captain.focus();
  await page.keyboard.press('Space');
  await expect(captain).not.toBeChecked();
  await expect(form.getByLabel("Captain's email")).toBeVisible();
  const zone = form.getByLabel('Time zone', { exact: true });
  await chooseOption(zone, 'Pacific/Auckland');
  await expect(zone).toHaveAttribute('data-value', 'Pacific/Auckland');
  await form.getByRole('button', { name: /Superbru rules/ }).click();
  const defaults = form.getByRole('switch', { name: /Default picks/ });
  await defaults.focus();
  await page.keyboard.press('Space');
  await expect(defaults).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('controls-desktop.png') });
  await page.setViewportSize({ width: 320, height: 900 });
  await defaults.scrollIntoViewIfNeeded();
  await expect(zone).toHaveAttribute('data-value', 'Pacific/Auckland');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('controls-mobile.png') });
});

test('Spartan dialogs trap keyboard focus and restore it after Escape', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/manage');
  await page.getByRole('button', { name: 'Details of Piele', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Archive Piele', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('search menus filter, explain empty results, and choose by keyboard without submitting', async ({
  page,
}, testInfo) => {
  await seedProfile(page);
  await page.goto('/manage');
  await page.getByRole('button', { name: /Start a league/ }).click();
  const zone = page.getByLabel('Time zone', { exact: true });
  await zone.click();
  const search = page.getByPlaceholder('Search time zones');
  await search.fill('not-a-real-zone');
  await expect(page.getByText('No matching options.', { exact: true })).toBeVisible();
  await search.fill('Auckland');
  await expect(page.getByText('No matching options.', { exact: true })).toBeHidden();
  await expect(page.locator('.pavilion-select-popover').getByRole('option')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('searchable-timezones.png') });
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(zone).toHaveAttribute('data-value', 'Pacific/Auckland');
  await expect(zone).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Enter a league name' })).toHaveCount(0);
  await expect(page.getByLabel('League name')).toHaveAttribute('aria-invalid', 'false');
});

test('a searchable picker inside a dialog closes before the dialog on Escape', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/piele/duties?round=2&scope=league');
  await page.getByRole('button', { name: 'New duty', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Put it on the register.' });
  const duty = dialog.getByRole('combobox', { name: 'Duty', exact: true });
  await chooseOption(duty, 'pick_confirmation');
  await expect(dialog).toContainText('A pick confirmation needs the deadline');
  await chooseOption(duty, 'spoon');
  const member = dialog.getByLabel('Member', { exact: true });
  await member.click();
  await page.getByPlaceholder('Search members').fill('Johan');
  await expect(page.getByRole('option', { name: 'Johan', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pavilion-select-popover')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(member).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New duty', exact: true })).toBeFocused();
});
