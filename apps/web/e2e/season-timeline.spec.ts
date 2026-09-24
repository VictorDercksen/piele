import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'piele-profile-v1',
      JSON.stringify({ displayName: 'Victor Dercksen', teamId: 'dhl-stormers', photo: null }),
    ),
  );
});

test('all published rounds, playoffs, timezone and selection persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?round=1');
  const stops = page.getByRole('navigation', { name: 'Season timeline' }).locator('.round-stop');
  const choose = (round: number) => stops.nth(round - 1).click();
  await expect(stops).toHaveCount(21);
  const ribbon = page.locator('.fixture-ribbon button');
  for (let round = 1; round <= 21; round++) {
    await choose(round);
    await expect(ribbon).toHaveCount(round <= 18 ? 8 : round === 19 ? 4 : round === 20 ? 2 : 1);
    if (round > 18) {
      await expect(ribbon.first()).toContainText('TBC');
      await expect(ribbon.first()).toContainText('TBCvTBC');
    }
  }
  await expect(page.getByRole('region', { name: 'Selected round' })).toContainText('Grand final');
  await page.reload();
  await expect(page).toHaveURL(/round=21/);
  await expect(stops.nth(20)).toHaveAttribute('aria-pressed', 'true');
  await choose(2);
  await expect(ribbon.filter({ hasText: 'Glasgow' })).toContainText('18:30');
  await choose(15);
  await expect(ribbon.filter({ hasText: 'Zebre' })).toContainText(/FRI,? 16 APR/);
  await expect(ribbon.filter({ hasText: 'Zebre' })).toContainText('19:30');
  await choose(8);
  await expect(page.getByRole('region', { name: 'Selected round' })).toContainText('2027');
  await expect(ribbon.filter({ hasText: 'Lions' })).toContainText('FEB');
  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('link', { name: 'Standings', exact: true })
    .click();
  await expect(page.locator('.standing-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Current round' }).click();
  await expect(page).toHaveURL(/round=1(?!\d)/);
  expect(errors).toEqual([]);
});

test('keyboard timeline and playoff layout on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/?round=18');
  const timeline = page.getByRole('navigation', { name: 'Season timeline' });
  const round18 = timeline.getByRole('button', { name: 'Round 18, Upcoming', exact: true });
  await round18.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/round=19/);
  await expect(
    timeline.getByRole('button', { name: 'Quarter-finals, Upcoming', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/round=21/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(
    page
      .getByRole('navigation', { name: 'Mobile league navigation' })
      .getByRole('link', { name: 'Rounds', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Enter the match centre' }).click();
  await expect(page).toHaveURL(/\/match\/\d+\?round=21/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('sample league duties, evidence, votes and round scoping', async ({ page }) => {
  await page.goto('/?round=2');
  const nav = page.getByRole('navigation', { name: 'League navigation', exact: true });
  await expect(page.getByRole('region', { name: 'Selected round' })).toContainText(
    'Sample league records',
  );
  await expect(page.locator('.duty-feature')).toContainText('Victor Dercksen');
  await expect(page.locator('.duty-feature')).toHaveClass(/spoon-duty/);
  await page.getByRole('button', { name: 'Upload evidence', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveClass(/spoon-duty/);
  const upload = page.locator('app-home-page input[type=file]');
  await upload.setInputFiles({
    name: 'note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('x'),
  });
  await expect(page.getByRole('alert')).toContainText('Choose a video file');
  await upload.setInputFiles({
    name: 'demo.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('demo'),
  });
  await page.getByRole('button', { name: 'Submit evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Over to the captain.' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('No file was uploaded');

  await nav.getByRole('link', { name: 'Duties', exact: true }).click();
  await expect(page).toHaveURL(/\/duties\?round=2/);
  await expect(page.locator('.register-card')).toHaveCount(1);
  await expect(page.locator('.register-card')).toContainText('Submitted for review');
  await page.getByRole('link', { name: 'League duties', exact: true }).click();
  await expect(page.locator('.register-card')).toHaveCount(2);
  await expect(page.locator('.register-card.spoon-duty')).toHaveCount(1);
  await expect(page.locator('.register-card:not(.spoon-duty)')).toContainText('Pick confirmation');

  await nav.getByRole('link', { name: 'Decisions', exact: true }).click();
  await expect(page.locator('.poll-card')).toContainText('7 of 12 members participated');
  await page.getByRole('button', { name: 'Have your say' }).click();
  await page.getByRole('radio', { name: 'Abstain' }).check();
  await page.getByRole('button', { name: 'Cast vote' }).click();
  await expect(page.locator('.poll-card')).toContainText('8 of 12 members participated');
  await expect(page.getByRole('button', { name: 'Review your vote' })).toBeVisible();

  await nav.getByRole('link', { name: 'Standings', exact: true }).click();
  await expect(page.locator('.standing-row.you img')).toHaveAttribute('src', /dhl-stormers/);
  await page
    .getByRole('navigation', { name: 'Season timeline' })
    .getByRole('button', { name: 'Round 03, Upcoming', exact: true })
    .click();
  await expect(page).toHaveURL(/\/standings\?round=3/);
  await expect(page.locator('.standing-row')).toHaveCount(0);

  await nav.getByRole('link', { name: 'More', exact: true }).click();
  await page.getByRole('link', { name: "Round 03 captain's desk" }).click();
  await expect(page.locator('.round-empty')).toContainText('Nothing needs your decision');
  await expect(page.locator('.member-list li')).toHaveCount(6);
  const liam = page.locator('.member-list li').filter({ hasText: 'Liam' });
  await liam.getByRole('button', { name: 'Release Liam' }).click();
  await page.getByRole('dialog').filter({ hasText: 'Release Liam?' }).getByRole('button', { name: 'Release name' }).click();
  await expect(liam).toContainText('OPEN');
  await expect(page.locator('.member-list li').filter({ hasText: 'You' }).getByRole('button', { name: /Release/ })).toHaveCount(0);
  await page.goto('/constitution');
  await expect(page.getByRole('heading', { name: 'Same club. Shared rules.' })).toBeVisible();
});

test('desktop rail and top bar stay in view while the content scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/?round=2');
  const rail = page.locator('.season-rail');
  await expect(rail.getByRole('link', { name: 'Piele home' })).toBeVisible();
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
  expect((await page.locator('.top-bar').boundingBox())!.y).toBe(0);
  expect((await page.locator('.round-bar').boundingBox())!.y).toBe(76);
  await expect(page.locator('.top-bar .header-profile')).toContainText('Victor Dercksen');
  const box = await rail.boundingBox();
  // Fractional document heights can move a bottom-constrained sticky rail by a subpixel.
  expect(Math.abs(box!.y)).toBeLessThan(1);
  expect(Math.round(box!.height)).toBe(800);
  const track = page.locator('.round-track');
  expect(await track.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(page.locator('.timeline-foot')).toBeInViewport();
});

test('URC ball loader covers start-up and slow page changes', async ({ page }) => {
  let hold = true;
  await page.route(/\.js$/, async (route) => {
    if (hold && route.request().url().includes('chunk-')) await page.waitForTimeout(1500);
    await route.continue();
  });
  const start = page.goto('/?round=2');
  await expect(page.getByRole('status', { name: 'Loading Piele' })).toBeVisible();
  await start;
  await expect(page.locator('.league')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading Piele' })).toHaveCount(0);

  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('link', { name: 'Decisions', exact: true })
    .click();
  await expect(page.getByRole('status', { name: 'Loading page' })).toBeVisible();
  await expect(page.locator('.poll-card')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading page' })).toHaveCount(0);
  hold = false;

  await page
    .getByRole('navigation', { name: 'Season timeline' })
    .locator('.round-stop')
    .nth(2)
    .click();
  await expect(page).toHaveURL(/round=3/);
  await expect(page.getByRole('status', { name: 'Loading page' })).toHaveCount(0);
});

test('fixture strip sits under the round header and features a match on the home page', async ({
  page,
}) => {
  await page.goto('/?round=2');
  const strip = page.getByRole('group', { name: 'Round 02 fixtures' });
  await expect(strip.getByRole('button')).toHaveCount(8);
  await expect(page.locator('.score-bug')).toContainText('Stormers');
  await strip.getByRole('button', { name: /Lions.*Ospreys/ }).click();
  await expect(page.locator('.score-bug')).toContainText('Lions');
  await expect(strip.getByRole('button', { name: /Lions.*Ospreys/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('link', { name: 'Duties', exact: true })
    .click();
  await expect(strip).toBeVisible();
  await expect(page.getByText('ROUND 02 →')).toHaveCount(0);
});

test('captain creates, records and decides duties; the feed follows', async ({ page }) => {
  await page.goto('/duties?round=2&scope=league');
  await expect(page.locator('.register-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'New duty' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Put it on the register.' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('09 Oct 2026 · 20:45 SAST');
  await dialog.getByLabel('Member').selectOption({ label: 'Johan' });
  await dialog.getByLabel('Reason').fill('Last place in Round 02.');
  await dialog.getByRole('button', { name: 'Create duty' }).click();
  await expect(page.getByRole('status')).toContainText('Round 02 Spoon duty created for Johan');
  const card = page.locator('.register-card').filter({ hasText: 'Johan' });
  await expect(card).toContainText('09 Oct 2026 · 20:45 SAST');
  await expect(card).toContainText('0 marks');
  await expect(card).toContainText('Next mark 16 Oct 2026 · 20:45 SAST');
  await card.getByRole('button', { name: 'Record evidence' }).click();
  const evidence = page.getByRole('dialog').filter({ hasText: 'Record the evidence.' });
  await evidence.locator('input[type=file]').setInputFiles({
    name: 'proof.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('demo'),
  });
  await evidence.getByRole('button', { name: 'Record evidence' }).click();
  await expect(evidence.getByRole('alert')).toContainText('Record when the duty was completed');
  await evidence.getByLabel('Completed at (SAST)').fill('2026-09-20T09:00');
  await evidence.getByRole('button', { name: 'Record evidence' }).click();
  await expect(page.getByRole('status')).toContainText('Evidence recorded for Johan');
  await expect(card).toContainText('Under review');

  await card.getByRole('button', { name: 'Void duty' }).click();
  const reason = page.getByRole('dialog').filter({ hasText: 'Void this duty?' });
  await reason.getByRole('button', { name: 'Void duty' }).click();
  await expect(reason.getByRole('alert')).toContainText('Give a reason');
  await reason.getByLabel('Reason').fill('Created by mistake');
  await reason.getByRole('button', { name: 'Void duty' }).click();
  await expect(card).toContainText('Voided');
  await expect(card).toContainText('Created by mistake');

  // In-app navigation keeps the sample league's in-memory state; a reload would reset it.
  const nav = page.getByRole('navigation', { name: 'League navigation', exact: true });
  await nav.getByRole('link', { name: 'More', exact: true }).click();
  await page.getByRole('link', { name: "Round 02 captain's desk" }).click();
  const review = page.locator('.review-row').filter({ hasText: 'Liam' });
  await expect(review).toContainText('Counts from submission');
  await review.getByRole('button', { name: 'Accept' }).click();
  const accept = page.getByRole('dialog').filter({ hasText: 'Accept this evidence?' });
  await expect(accept).toContainText('04 Oct 2026 · 12:30 SAST');
  await accept.getByRole('button', { name: 'Accept evidence' }).click();
  await expect(page.getByRole('status')).toContainText('completed for Liam');
  await expect(page.locator('.round-empty')).toContainText('Nothing needs your decision');

  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  const feed = page.locator('app-feed');
  await expect(feed.locator('.feed-item').nth(1)).toContainText('Round 02 Pick confirmation completed');
  await expect(feed.locator('.feed-item')).toHaveCount(10);
  await feed.getByRole('button', { name: 'Season' }).click();
  await expect(feed.locator('.feed-item')).toHaveCount(13);
  await expect(feed.locator('.feed-item').last()).toContainText('URC 2026/27 is open');
  await nav.getByRole('link', { name: 'Standings', exact: true }).click();
  await page.getByRole('button', { name: 'House marks' }).click();
  const arno = page.locator('.standing-row').filter({ hasText: 'Arno' });
  await expect(arno).toContainText('1 open duty');
  expect(Number(await arno.locator('strong').textContent())).toBeGreaterThanOrEqual(3);

  // A challenge upheld in Arno's favour clears his marks and restarts the clock.
  await page.getByRole('navigation', { name: 'Season timeline' }).locator('.round-stop').first().click();
  await nav.getByRole('link', { name: 'Duties', exact: true }).click();
  await page.getByRole('link', { name: 'League duties', exact: true }).click();
  const arnoDuty = page.locator('.register-card').filter({ hasText: 'Arno' });
  await expect(arnoDuty).toContainText('Overdue');
  await arnoDuty.getByRole('button', { name: 'Reset clock' }).click();
  const upheld = page.getByRole('dialog').filter({ hasText: 'Challenge upheld?' });
  await upheld.getByLabel('Reason').fill('Picks were submitted on time');
  await upheld.getByRole('button', { name: 'Reset the clock' }).click();
  await expect(arnoDuty).toContainText('0 marks');
  await expect(arnoDuty).toContainText('Clock reset');
  await nav.getByRole('link', { name: 'Standings', exact: true }).click();
  await page.getByRole('button', { name: 'House marks' }).click();
  await expect(page.locator('.standing-row').filter({ hasText: 'Arno' }).locator('strong')).toHaveText('0');
});

test('evidence dialog is centred on desktop and phone', async ({ page }) => {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [320, 700],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/?round=2');
    await page.getByRole('button', { name: 'Upload evidence', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'The proof is in the video.' });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - height / 2)).toBeLessThan(2);
    expect(box.width).toBeLessThanOrEqual(width - 24);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
});
