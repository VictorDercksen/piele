import { expect, Page, test } from '@playwright/test';
import { chooseOption, openSection, seedProfile } from './support';

// Superbru picks, scoring and standings in the sample build. The sample results score URC
// rounds 1 and 2 (a fixture with one counts as kicked off); round 3 is still open, so hold the
// date after round 2 and before round 3 kicks off. Sample changes live in memory, so each
// journey stays inside the app after its first page load.
const AFTER_ROUND_2 = new Date('2026-10-06T10:00:00Z');
// Round 1: Connacht 17–30 Stormers. Round 3: Stormers v Sharks, 10 Oct.
const CONNACHT_STORMERS = '292585';
const STORMERS_SHARKS = '292603';

test.beforeEach(async ({ page }) => {
  await seedProfile(page);
  await page.clock.setFixedTime(AFTER_ROUND_2);
});

function picksPanel(page: Page) {
  return page.locator('app-picks-panel');
}

test('before kickoff a member sees only the pick form; saving the pick reveals the pool', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/piele/match/${STORMERS_SHARKS}?round=3`);
  const panel = picksPanel(page);
  await expect(panel.getByRole('heading', { name: 'Pool picks.' })).toBeVisible();
  await expect(panel.locator('.section-title .status-pill')).toHaveText('open');
  await expect(panel).toContainText("Make your pick to see the pool's picks.");
  await expect(panel).toContainText('Picks lock at kickoff, 10 Oct 16:00 SAST.');
  // Nothing of the pool shows until the member has picked.
  await expect(panel.getByRole('table')).toHaveCount(0);
  await expect(panel.getByRole('img', { name: /The pool's split/ })).toHaveCount(0);

  // An empty submit raises one warning card and points at the scale; a draw has no margin.
  const scale = panel.locator('.scale');
  const marker = panel.getByRole('slider', { name: 'Your pick' });
  await expect(marker).toHaveAttribute('aria-valuetext', 'No pick yet');
  await panel.getByRole('button', { name: 'Save pick' }).click();
  const warning = page.getByRole('status').filter({ hasText: 'Yellow card' });
  await expect(warning.filter({ hasText: 'Choose a side or a draw.' })).toBeVisible();
  await expect(warning).toHaveCount(1);
  await expect(scale).toHaveAttribute('aria-invalid', 'true');
  // The range lies unseen over the track, so the strip itself carries the flag.
  await expect(scale).toHaveClass(/problem-flag/);
  await expect(marker).not.toBeFocused();
  await panel.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(marker).toHaveAttribute('aria-valuetext', 'A draw');
  await expect(panel.getByLabel('Margin (points)')).toBeDisabled();
  await expect(panel.getByText('A draw has no margin.')).toBeVisible();

  // Stormers by 7: the crest moves the marker a point toward Stormers, the margin is typed,
  // and an out-of-range margin is refused first.
  await panel.getByRole('button', { name: 'One point toward Stormers' }).click();
  await expect(marker).toHaveAttribute('aria-valuetext', 'Stormers by 1');
  await expect(marker).toHaveAttribute('aria-valuenow', '-1');
  // The matchup's crests sit above the scale.
  const homeCrest = panel.getByRole('button', { name: 'One point toward Stormers' });
  expect((await homeCrest.boundingBox())!.y).toBeLessThan((await scale.boundingBox())!.y);
  const marginBox = panel.getByLabel('Margin (points)');
  await panel.getByRole('button', { name: 'One point toward Sharks' }).click();
  await panel.getByRole('button', { name: 'One point toward Sharks' }).click();
  await expect(marker).toHaveAttribute('aria-valuetext', 'Sharks by 1');
  // The stepper moves the margin a point, keeping the side.
  await panel.getByRole('button', { name: 'One point more' }).click();
  await expect(marker).toHaveAttribute('aria-valuetext', 'Sharks by 2');
  await expect(marginBox).toHaveValue('2');
  // A quick margin under the strip sets the side and the margin in one tap.
  await panel.getByRole('button', { name: 'Stormers by 7', exact: true }).click();
  await expect(marker).toHaveAttribute('aria-valuetext', 'Stormers by 7');
  await expect(marker).toHaveAttribute('aria-valuenow', '-7');
  await expect(marginBox).toHaveValue('7');
  await expect(panel.getByRole('button', { name: 'Stormers by 7', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel.getByLabel('Margin (points)').fill('200');
  await panel.getByRole('button', { name: 'Save pick' }).click();
  // The new attempt replaces the card rather than stacking another. The old card, whose detail
  // line named the margin too, is still leaving for a moment, so wait for the new one first.
  await expect(
    warning
      .filter({ hasText: 'Enter a margin from 1 to 150.' })
      .filter({ hasNotText: 'Choose a side or a draw.' }),
  ).toBeVisible();
  await expect(warning).toHaveCount(1);
  await expect(panel.getByLabel('Margin (points)')).toHaveAttribute('aria-invalid', 'true');
  await expect(panel.getByLabel('Margin (points)')).toHaveClass(/problem-flag/);
  await expect(panel.getByLabel('Margin (points)')).not.toBeFocused();
  await panel.getByLabel('Margin (points)').fill('7');
  await panel.getByRole('button', { name: 'Save pick' }).click();

  // The pick is in: a green card names it, then the member's strip; the pool table waits
  // behind the chevron.
  await expect(
    page.getByRole('status').filter({ hasText: 'Pick saved: Stormers by 7.' }),
  ).toBeVisible();
  await expect(marker).toHaveCount(0);
  const mine = panel.locator('.mine');
  await expect(mine).toBeFocused();
  await expect(mine).toContainText('Your pick');
  await expect(mine.locator('app-pick-chip')).toContainText('Stormers');
  await expect(mine.locator('app-pick-chip')).toContainText('7');
  // The pool table waits behind the chevron, closed by default.
  const pool = panel.getByRole('table', { name: 'Picks for Stormers v Sharks' });
  await expect(pool).toBeHidden();
  const chevron = panel.getByRole('button', { name: "Show the pool's picks" });
  await expect(chevron).toHaveAttribute('aria-expanded', 'false');
  await chevron.click();
  await expect(panel.getByRole('button', { name: "Hide the pool's picks" })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(pool).toBeVisible();
  await expect(pool.locator('tbody tr')).toHaveCount(1);
  await expect(pool.locator('tbody tr.you')).toContainText('Victor Dercksen');
  // Only the member's own pick is visible, so there is no split to show yet.
  await expect(panel.getByRole('img', { name: /The pool's split/ })).toHaveCount(0);
  // No marks or points before kickoff.
  await expect(pool.getByRole('columnheader', { name: 'Pts' })).toHaveCount(0);

  // Until kickoff the pick can be edited; the form opens with it filled in.
  await panel.getByRole('button', { name: 'Edit your pick' }).click();
  await expect(marker).toBeFocused();
  await expect(marker).toHaveAttribute('aria-valuenow', '-7');
  await expect(marker).toHaveAttribute('aria-valuetext', 'Stormers by 7');
  await expect(panel.getByLabel('Margin (points)')).toHaveValue('7');
  // The keyboard moves the marker a point at a time; right is toward the away side.
  await marker.press('ArrowRight');
  await expect(marker).toHaveAttribute('aria-valuetext', 'Stormers by 6');
  await expect(panel.getByLabel('Margin (points)')).toHaveValue('6');
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(mine).toBeFocused();
  expect(errors).toEqual([]);
});

test('the home page lays the round’s picks along its kickoffs', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Round 3 is still to pick: every dot is an open ring, the pin stands before Friday.
  await page.goto('/piele?round=3');
  const hero = page.locator('app-match-hero');
  const ruler = hero.locator('.kickoff-ruler');
  await expect(ruler.locator('.ruler-label')).toHaveText('YOUR PICKS · 0 OF 8 IN · 8 TO MAKE');
  await expect(ruler.locator('.ruler-slot')).toHaveCount(5);
  await expect(ruler.locator('.ruler-slot .ruler-time')).toHaveText([
    'FRI20:45',
    'SAT13:30',
    'SAT16:00',
    'SAT18:30',
    'SAT20:45',
  ]);
  await expect(ruler.locator('.ruler > :first-child')).toHaveClass(/ruler-now/);
  await expect(ruler.locator('.ruler-now .ruler-time')).toHaveText('NOWTUE 12:00');
  await expect(ruler.locator('.dot.open')).toHaveCount(8);
  const stormers = ruler.getByRole('link', {
    name: 'Stormers v Sharks: no pick yet, locks SAT 16:00',
    exact: true,
  });
  await expect(stormers).toHaveClass(/open/);

  // A dot opens its match; a pick there shows on the ruler as the club's crest.
  await stormers.click();
  await expect(page).toHaveURL(new RegExp(`/piele/match/${STORMERS_SHARKS}\\?round=3$`));
  const panel = picksPanel(page);
  await panel.getByRole('button', { name: 'One point toward Stormers' }).click();
  await panel.getByRole('button', { name: 'Save pick' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pick saved' })).toBeVisible();
  await page.locator('.desktop-nav').getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/piele\?round=3$/);
  await expect(ruler.locator('.ruler-label')).toHaveText('YOUR PICKS · 1 OF 8 IN · 7 TO MAKE');
  await page.screenshot({ path: testInfo.outputPath('kickoff-ruler.png') });
  const picked = ruler.getByRole('link', { name: 'Stormers v Sharks: Stormers by 1', exact: true });
  await expect(picked).not.toHaveClass(/open/);
  await expect(picked.locator('img')).toHaveAttribute('src', /dhl-stormers/);
  await expect(ruler.locator('.dot.open')).toHaveCount(7);

  // Round 2 kicked off with every pick in: eight crests and the pin past the last kickoff.
  await page.locator('.desktop-nav').getByRole('link', { name: 'Home', exact: true }).click();
  await page.goto('/piele?round=2');
  await expect(ruler.locator('.ruler-label')).toHaveText('YOUR PICKS · 8 OF 8 IN');
  await expect(ruler.locator('.dot img')).toHaveCount(8);
  await expect(ruler.locator('.ruler > :last-child')).toHaveClass(/ruler-now/);
  expect(errors).toEqual([]);
});

test('a kicked-off fixture shows every pick with its marks, points and the member’s place', async ({
  page,
}) => {
  await page.goto(`/piele/match/${CONNACHT_STORMERS}?round=1`);
  const panel = picksPanel(page);
  await expect(panel.locator('.section-title .status-pill')).toHaveText('final');
  await expect(panel.getByRole('slider', { name: 'Your pick' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Edit your pick' })).toHaveCount(0);

  // The member's own line: the pick, its points and the place among the fixture's picks.
  const mine = panel.locator('.mine');
  await expect(mine.locator('app-pick-chip')).toContainText('Connacht');
  await expect(mine.locator('.mine-points')).toHaveText('0 pts');
  await expect(mine.locator('.mine-place')).toHaveText('4th of 6 in this match');

  // Closed by default: the member's line only; the chevron opens the split and the pool.
  const pool = panel.getByRole('table', { name: 'Picks for Connacht v Stormers' });
  await expect(pool).toBeHidden();
  await expect(panel.getByRole('img', { name: /The pool's split/ })).toBeHidden();
  await expect(panel.locator('.panel-source')).toBeHidden();
  await panel.getByRole('button', { name: "Show the pool's picks" }).click();
  await expect(pool).toBeVisible();

  // Every pick, from the biggest home margin to the biggest away margin, with W, M and B.
  for (const heading of ['W', 'M', 'B', 'Pts']) {
    await expect(pool.getByRole('columnheader', { name: heading, exact: true })).toBeVisible();
  }
  const rows = pool.locator('tbody tr');
  await expect(rows).toHaveCount(6);
  await expect(rows.locator('th')).toHaveText([
    'Franco',
    'Arno',
    /Victor Dercksen\s*YOU/,
    'Johan',
    'PieterW',
    'Liam',
  ]);
  // Arno's Superbru default pick is tagged; it earns nothing on a wrong outcome.
  await expect(rows.nth(1).locator('.default-tag')).toHaveText('default');
  // Johan has the outcome only; PieterW and Liam share the bonus point.
  await expect(rows.nth(3)).toContainText('outcome point');
  await expect(rows.nth(3)).toContainText('no margin point');
  await expect(rows.nth(3).locator('.c-points')).toHaveText('1');
  await expect(rows.nth(4).locator('.mark.earned')).toHaveCount(3);
  await expect(rows.nth(4)).toContainText('0.5 of the bonus point');
  await expect(rows.nth(4).locator('.c-points')).toHaveText('2');
  await expect(rows.nth(0).locator('.mark.earned')).toHaveCount(0);
  // Earned marks are drawn in the honours-board brass.
  await expect(rows.nth(4).locator('.mark.earned').first()).toHaveCSS(
    'background-color',
    'rgb(217, 179, 108)',
  );
  await expect(panel.locator('.panel-source')).toHaveText(
    'Superbru scoring · Outcome 1 · Within 5 0.5 · Closest 1, shared when tied, within 15 only.',
  );

  // The table fits a 320 px phone.
  await page.setViewportSize({ width: 320, height: 850 });
  await expect(rows).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('standings show the round and season tables with badges and the breakdown', async ({
  page,
}) => {
  await page.goto('/piele/standings?round=2');
  const tabs = page.locator('.content-tabs');
  await expect(tabs.getByRole('button', { name: 'Round' })).toHaveAttribute('aria-pressed', 'true');
  const round = page.getByRole('region', { name: 'Round standings' });
  await expect(round.locator('.board-status .tag')).toHaveText('complete');
  const rows = round.locator('.points-row');
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText('Johan');
  await expect(rows.first()).toContainText('19.5');
  // The round's cap and spoon; no crown on the round table.
  await expect(rows.first().getByRole('img', { name: 'Round winner' })).toBeVisible();
  await expect(rows.last()).toContainText('Victor Dercksen');
  await expect(rows.last().getByRole('img', { name: 'Round spoon' })).toBeVisible();
  await expect(round.getByRole('img', { name: "Last season's champion" })).toHaveCount(0);

  // The season tab is kept in the query; Johan leads and wears last season's crown too.
  await tabs.getByRole('button', { name: 'Season' }).click();
  await expect(page).toHaveURL(/table=season/);
  await expect(page).toHaveURL(/round=2/);
  const season = page.getByRole('region', { name: 'Season standings' });
  const seasonRows = season.locator('.points-row');
  await expect(seasonRows).toHaveCount(6);
  await expect(seasonRows.first()).toContainText('Johan');
  await expect(seasonRows.first()).toContainText('2 rounds');
  await expect(seasonRows.first()).toContainText('25.0');
  await expect(
    seasonRows.first().getByRole('img', { name: "Last season's champion" }),
  ).toBeVisible();
  await expect(seasonRows.first().getByRole('img', { name: 'Round winner' })).toBeVisible();
  await expect(
    season
      .locator('.points-row', { hasText: 'Victor Dercksen' })
      .getByRole('img', { name: 'Round spoon' }),
  ).toBeVisible();

  // The breakdown adds a labelled WP, MP, GSP and BP bar with a key, and is remembered.
  const toggle = season.getByRole('button', { name: 'Breakdown', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(season.getByRole('group', { name: 'Breakdown key' })).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const key = season.getByRole('group', { name: 'Breakdown key' });
  await expect(key.getByRole('button')).toHaveText([
    /WP Win points/,
    /MP Margin points/,
    /GSP Grand slam points/,
    /BP Bonus points/,
  ]);
  const bonus = seasonRows.first().locator('.breakdown-bar .segment.bp');
  await expect(bonus).toHaveCSS('background-color', 'rgb(217, 179, 108)');
  await expect(bonus).toHaveText(/^[\d.]+$/);
  await expect(seasonRows.first().locator('.visually-hidden')).toContainText('win points');
  // Highlighting a part dims the others.
  await key.getByRole('button', { name: /Bonus points/ }).click();
  await expect(bonus).toHaveCSS('opacity', '1');
  await expect(seasonRows.first().locator('.breakdown-bar .segment.wp')).toHaveCSS(
    'opacity',
    '0.22',
  );
  await page.reload();
  await expect(season.getByRole('button', { name: 'Breakdown', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Round 1 has its own cap and spoon.
  await page.goto('/piele/standings?round=1&table=round');
  const first = page.getByRole('region', { name: 'Round standings' }).locator('.points-row');
  await expect(first.first()).toContainText('PieterW');
  await expect(first.first().getByRole('img', { name: 'Round winner' })).toBeVisible();
  await expect(first.last()).toContainText('Franco');
  await expect(first.last().getByRole('img', { name: 'Round spoon' })).toBeVisible();

  // The standings fit a 320 px phone with the breakdown on.
  await page.setViewportSize({ width: 320, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the desk opens closed, except the section a link names', async ({ page }) => {
  await page.goto('/piele/captain#picks');
  await expect(page.getByRole('button', { name: 'Superbru picks.' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.locator('#picks').getByRole('group', { name: /fixtures$/ })).toBeVisible();
  for (const heading of [
    'Evidence to decide.',
    'The team sheet.',
    'The join link.',
    'Colours and crest.',
    'Superbru rules.',
  ]) {
    await expect(page.getByRole('button', { name: heading })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  }
  await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0);
});

test('the captain records a pick, overrides a round total and clears it', async ({ page }) => {
  await page.goto('/piele/captain?round=2');
  const card = page.locator('app-picks-card');
  await expect(card.getByRole('heading', { name: 'Superbru picks.' })).toBeVisible();
  await openSection(page, 'Superbru picks.');

  // Liam missed Cardiff v Zebre (32–10); record Cardiff by 10 for him.
  const strip = card.getByRole('group', { name: 'Round 02 fixtures' });
  const cardiff = strip.getByRole('button', { name: /Cardiff/ });
  await cardiff.click();
  await expect(cardiff).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByRole('heading', { name: /Cardiff.* v Zebre/ })).toContainText('32–10');
  const liam = card.getByRole('radiogroup', { name: "Liam's pick" });
  const missed = card.getByLabel('Missed by Liam');
  await expect(missed).toBeChecked();
  const derived = card.locator('.round-table tbody tr', { hasText: 'Liam' }).first();
  await expect(derived.locator('td').first()).toHaveText('6.5');
  await missed.click();
  await expect(missed).not.toBeChecked();
  await liam.getByRole('radio', { name: 'Cardiff' }).check();
  await card.getByLabel('Margin for Liam').fill('10');
  await card.getByRole('button', { name: 'Save picks' }).click();
  await expect(page.getByText('Picks saved for Cardiff v Zebre.')).toBeVisible();
  await expect(card.getByLabel('Missed by Liam')).not.toBeChecked();
  await expect(liam.getByRole('radio', { name: 'Cardiff' })).toBeChecked();
  await expect(derived.locator('td').first()).toHaveText('7.5');

  // Override Liam's round total, as after Superbru reprocessing.
  await card.getByRole('button', { name: "Override Liam's total" }).click();
  const total = card.getByLabel('Recorded total for Liam');
  await expect(total).toBeFocused();
  await expect(total).toHaveValue('7.5');
  await total.fill('20');
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText("Liam's Round 02 total is recorded as 20.")).toBeVisible();
  const liamRow = card.locator('.round-table tbody tr', { hasText: 'Liam' }).first();
  await expect(liamRow).toContainText('20');
  await expect(liamRow.locator('.tag')).toHaveText('DIFFERS');
  await expect(card.getByRole('button', { name: "Override Liam's total" })).toBeFocused();

  // The standings follow, marking the override.
  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('link', { name: 'Standings', exact: true })
    .click();
  const top = page.getByRole('region', { name: 'Round standings' }).locator('.points-row').first();
  await expect(top).toContainText('Liam');
  await expect(top).toContainText('20.0');
  await expect(top.locator('.override-tag')).toHaveText('override');
  await page.goBack();
  await openSection(page, 'Superbru picks.');

  // Clearing the override puts the derived total back.
  await card.getByRole('button', { name: "Override Liam's total" }).click();
  await card.getByRole('button', { name: 'Clear', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: "Clear Liam's recorded total?" });
  await confirm.getByRole('button', { name: 'Clear total' }).click();
  await expect(page.getByText("Liam's Round 02 total follows the picks again.")).toBeVisible();
  await expect(liamRow.locator('.tag')).toHaveCount(0);
  await expect(card.getByRole('button', { name: "Override Liam's total" })).toBeFocused();

  // The round's spoon holder can be proposed for Spoon duty.
  await expect(card.locator('.spoon-line')).toContainText('Spoon: Victor Dercksen');
  await card.getByRole('button', { name: 'Propose Spoon duty for Victor Dercksen' }).click();
  const duty = page.getByRole('dialog', { name: 'Put it on the register.' });
  await expect(duty).toBeVisible();
  await expect(duty.getByLabel('Member')).toHaveAttribute('data-value', 'member-me');
  await expect(duty.getByLabel('Duty')).toHaveAttribute('data-value', 'spoon');
  await expect(duty.getByLabel(/Reason/)).toHaveValue('Last place in Round 02.');
  await duty.getByRole('button', { name: 'Close dialog' }).click();
  await expect(duty).toBeHidden();
});

test('a new league takes its Superbru rules from the form', async ({ page }) => {
  await seedProfile(page, { leagues: ['piele', 'bokkie-bru'] });
  await page.goto('/manage');
  await page.getByRole('button', { name: /Start a league/ }).click();
  const form = page.locator('app-create-league-form');
  await form.getByLabel('League name').fill('Bokkie Bru');
  await form.locator('#new-league-member-0-name').fill('Victor');
  await form.locator('#new-league-member-0-superbru').fill('Vic');
  await form.locator('#new-league-member-1-name').fill('Doempie');
  await form.locator('#new-league-member-1-superbru').fill('Doempie');
  await chooseOption(form.getByLabel('Captain', { exact: true }), 'Vic');

  // The rules start collapsed at Piele's.
  const rules = form.locator('#new-league-rules');
  await expect(rules).toHaveAttribute('data-state', 'closed');
  await rules.getByText('Superbru rules').click();
  await expect(rules).toHaveAttribute('data-state', 'open');
  const defaults = rules.getByRole('switch', { name: /Default picks/ });
  await expect(defaults).toBeChecked();
  await expect(rules.getByLabel('Starting round')).toHaveValue('1');
  await expect(rules.getByLabel('Win points, final')).toHaveValue('3');
  await expect(rules.getByLabel('Grand slam points')).toHaveValue('2');
  // Last season's champion is set on the captain's desk, not here.
  await expect(rules.getByLabel("Previous season's champion")).toHaveCount(0);

  // An impossible starting round is pointed out on submit.
  await rules.locator('label.switch', { hasText: 'Default picks' }).click();
  await expect(defaults).not.toBeChecked();
  await rules.getByLabel('Starting round').fill('40');
  await form.getByRole('button', { name: 'Create league' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Starting round: choose a round from 1 to 18.' }),
  ).toBeVisible();
  await expect(rules.getByLabel('Starting round')).toHaveAttribute('aria-invalid', 'true');
  await expect(rules.getByLabel('Starting round')).toHaveClass(/problem-flag/);
  await expect(rules.getByLabel('Starting round')).not.toBeFocused();
  await rules.getByLabel('Starting round').fill('3');
  await form.getByRole('button', { name: 'Create league' }).click();
  await expect(page).toHaveURL(/\/bokkie-bru$/);

  // The captain's desk shows the league's rules as they were created.
  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('link', { name: 'More', exact: true })
    .click();
  await page.getByRole('link', { name: /captain's desk/i }).click();
  await expect(page).toHaveURL(/\/bokkie-bru\/captain/);
  const card = page.locator('app-rules-card');
  await expect(card.getByRole('heading', { name: 'Superbru rules.' })).toBeVisible();
  await openSection(page, 'Superbru rules.');
  await expect(card.getByRole('switch', { name: /Default picks/ })).not.toBeChecked();
  await expect(card.getByLabel('Starting round')).toHaveValue('3');
  await expect(card.getByLabel('Margin window')).toHaveValue('5');
});
