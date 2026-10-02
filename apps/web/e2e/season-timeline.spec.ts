import { test, expect } from '@playwright/test';
import { chooseOption, openSection, seedProfile } from './support';

test.beforeEach(async ({ page }) => {
  await seedProfile(page);
});

test('all published rounds, playoffs, timezone and selection persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // "Current round" follows the date, so hold it before Round 01 kicks off.
  await page.clock.setFixedTime(new Date('2026-09-20T10:00:00Z'));
  await page.goto('/piele?round=1');
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
  await expect(page.getByRole('region', { name: 'Selected round' })).toContainText('Round 08');
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
  await page.goto('/piele?round=18');
  const picker = page.getByRole('button', { name: /^Choose round,/ });
  await picker.click();
  const dialog = page.getByRole('dialog', { name: 'Choose a round' });
  const timeline = dialog.getByRole('navigation', { name: 'Season timeline' });
  const round18 = timeline.getByRole('button', { name: 'Round 18, Upcoming', exact: true });
  await round18.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/round=19/);
  await expect(
    timeline.getByRole('button', { name: 'Quarter-finals, Upcoming', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/round=21/);
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(picker).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(
    page
      .getByRole('navigation', { name: 'Mobile league navigation' })
      .getByRole('link', { name: 'Rounds', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Enter the match centre' }).click();
  await expect(page).toHaveURL(/\/piele\/match\/\d+\?round=21/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('sample league duties, evidence, votes and round scoping', async ({ page }) => {
  await page.goto('/piele?round=2');
  const nav = page.getByRole('navigation', { name: 'League navigation', exact: true });
  await expect(page.getByRole('region', { name: 'Selected round' })).toContainText('Round 02');
  await expect(page.locator('.duty-feature')).toContainText('The Spoon');
  await expect(page.locator('.duty-feature')).toHaveClass(/spoon-duty/);
  await page.getByRole('button', { name: 'Upload evidence', exact: true }).click();
  await expect(page.getByRole('dialog').locator('hlm-dialog-content')).toHaveClass(/spoon-duty/);
  const upload = page.getByRole('dialog').locator('input[type=file]');
  await upload.setInputFiles({
    name: 'note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('x'),
  });
  await expect(page.getByRole('status').filter({ hasText: 'Choose a video file' })).toBeVisible();
  await expect(upload).toHaveAttribute('aria-invalid', 'true');
  await upload.setInputFiles({
    name: 'demo.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('demo'),
  });
  await page.getByRole('button', { name: 'Submit evidence' }).click();
  await expect(page.locator('.duty-feature')).toContainText('The Spoon · Under review');
  await expect(page.locator('.duty-feature')).toContainText('Members vote until');
  await expect(page.getByRole('status').filter({ hasText: 'No file was uploaded' })).toBeVisible();
  // The dialog's warning left with the problem it named.
  await expect(page.getByRole('status').filter({ hasText: 'Choose a video file' })).toHaveCount(0);

  await nav.getByRole('link', { name: 'Duties', exact: true }).click();
  await expect(page).toHaveURL(/\/piele\/duties\?round=2/);
  await expect(page.locator('.register-card')).toHaveCount(1);
  await expect(page.locator('.register-card')).toContainText('Members are voting on the evidence');
  await page.getByRole('button', { name: 'League duties', exact: true }).click();
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
  await expect(page.locator('.standing-row.you app-member-avatar img')).toHaveAttribute(
    'src',
    /dhl-stormers/,
  );
  await page
    .getByRole('navigation', { name: 'Season timeline' })
    .getByRole('button', { name: 'Round 03, Upcoming, 1 decision open', exact: true })
    .click();
  await expect(page).toHaveURL(/\/piele\/standings\?round=3/);
  await expect(page.locator('.standing-row')).toHaveCount(0);

  await nav.getByRole('link', { name: 'More', exact: true }).click();
  await page.getByRole('link', { name: /^Captain's desk/ }).click();
  // Every section of the desk is closed until its chevron opens it.
  await expect(page.getByRole('button', { name: 'Evidence to decide.' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await openSection(page, 'Evidence to decide.');
  await expect(page.locator('.round-empty')).toContainText('Nothing needs your decision');
  await openSection(page, 'The team sheet.');
  await expect(page.locator('.member-list li')).toHaveCount(6);
  const liam = page.locator('.member-list li').filter({ hasText: 'Liam' });
  await liam.getByRole('button', { name: 'Release Liam' }).click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Release Liam?' })
    .getByRole('button', { name: 'Release name' })
    .click();
  await expect(liam).toContainText('OPEN');
  await expect(
    page
      .locator('.member-list li')
      .filter({ hasText: 'You' })
      .getByRole('button', { name: /Release/ }),
  ).toHaveCount(0);
  await page.goto('/piele/constitution');
  await expect(page.getByRole('heading', { name: 'Same club. Shared rules.' })).toBeVisible();
});

test('an empty personal register leads to the league duties', async ({ page }) => {
  await page.goto('/piele/duties?round=5');
  const empty = page.locator('.round-empty');
  await expect(
    empty.getByRole('heading', { name: 'No personal duties in Round 05.' }),
  ).toBeVisible();
  await empty.getByRole('button', { name: 'See league duties' }).click();
  await expect(page).toHaveURL(/\/piele\/duties\?round=5&scope=league$/);
  await expect(empty.getByRole('heading', { name: 'No league duties in Round 05.' })).toBeVisible();
  await expect(empty.getByRole('button', { name: 'See league duties' })).toHaveCount(0);
});

test('a short page opened from deep in a long one starts at the top, the bottom bar in place', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/piele?round=1');
  await expect(page.locator('app-feed .feed-item').first()).toBeVisible();
  await page.evaluate(() => scrollTo(0, 1200));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(800);
  const nav = page.getByRole('navigation', { name: 'Mobile league navigation' });
  // The bar is fixed to the viewport, not a row of the page's grid.
  await expect(nav).toHaveCSS('position', 'fixed');
  await nav.evaluate((element) => {
    const gaps: number[] = [];
    const started = performance.now();
    const tick = () => {
      gaps.push(
        innerHeight -
          element.getBoundingClientRect().bottom -
          parseFloat(getComputedStyle(element).bottom),
      );
      if (performance.now() - started < 1500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    (window as unknown as { navGaps: number[] }).navGaps = gaps;
  });
  await nav.getByRole('link', { name: 'Duties', exact: true }).click();
  await expect(page).toHaveURL(/\/piele\/duties/);
  await expect(page.getByRole('heading', { name: /No personal duties/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.waitForTimeout(1600);
  // The bar never moved off the bottom of the viewport.
  const gaps = await page.evaluate(() => (window as unknown as { navGaps: number[] }).navGaps);
  expect(gaps.length).toBeGreaterThan(10);
  for (const gap of gaps) expect(Math.abs(gap)).toBeLessThan(1);
  // Scrolled to its end, the page's footer clears the bar: the grid is padded by its height.
  const clearance = await page.evaluate(() => {
    const bar = document.querySelector('.mobile-nav')!.getBoundingClientRect();
    const footer = document.querySelector('.club-footer')!.getBoundingClientRect();
    return document.documentElement.scrollHeight - (footer.bottom + scrollY) - bar.height;
  });
  expect(clearance).toBeGreaterThanOrEqual(-1);
});

test('a page ends where its content ends: closed overlays and dropdowns add no scroll', async ({
  page,
}) => {
  // Eight pages at three sizes.
  test.setTimeout(90_000);
  // The league switcher's sheet and scrim and the notifications cloth hang under the sticky
  // top bar (the switcher's popover under the sticky rail), and a closed dropdown's body holds
  // its visually hidden table text. Left rendered while closed, they extended the document,
  // and iOS Safari measures a sticky bar's descendants at its stuck position, so a page could
  // be scrolled a viewport past its footer.
  const overhang = () =>
    page.evaluate(() => {
      const bottom = (element: Element) => element.getBoundingClientRect().bottom + scrollY;
      const nav = document.querySelector('.mobile-nav')!;
      const padding =
        getComputedStyle(nav).position === 'fixed'
          ? nav.getBoundingClientRect().height + parseFloat(getComputedStyle(nav).bottom)
          : 0;
      const end = Math.max(innerHeight, bottom(document.querySelector('.club-footer')!) + padding);
      const beyond: string[] = [];
      for (const bar of document.querySelectorAll('.top-bar, .season-rail, .round-bar')) {
        const box = bar.getBoundingClientRect();
        for (const element of bar.querySelectorAll('*')) {
          const rect = element.getBoundingClientRect();
          if (rect.height === 0 || rect.bottom <= box.bottom + 1) continue;
          let clipped = false;
          for (let parent = element.parentElement; parent !== bar; parent = parent!.parentElement)
            if (getComputedStyle(parent!).overflowY !== 'visible') clipped = true;
          if (!clipped) beyond.push(element.className);
        }
      }
      return { excess: document.documentElement.scrollHeight - end, beyond };
    });
  for (const [width, height] of [
    [390, 700],
    [390, 664],
    [1440, 1100],
  ]) {
    await page.setViewportSize({ width, height });
    for (const path of [
      '/piele/duties?round=1',
      '/piele/decisions?round=3',
      '/piele/more?round=3',
      '/piele/standings?round=3',
      '/piele/constitution?round=1',
      '/piele/captain?round=1',
      '/piele/match/292585?round=1',
      '/piele?round=1',
    ]) {
      await page.goto(path);
      await expect(page.locator('.page-loading')).toHaveCount(0);
      await expect(page.locator('.page-body')).toBeVisible();
      await expect.poll(overhang, { message: `${path} at ${width}px` }).toEqual({
        excess: expect.any(Number),
        beyond: [],
      });
      expect(Math.abs((await overhang()).excess), `${path} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});

test('a short page does not scroll on a phone', async ({ page }) => {
  // The shell fills the screen with a minimum height. On iOS Safari 100vh is the viewport with
  // its toolbars collapsed, taller than the area visible with them shown, so a short page could
  // be scrolled by the toolbars' height (its heading under the top bar, a blank strip below).
  // Chromium has no collapsing toolbars, so the guard below also checks that no box around the
  // page takes its minimum height from the large viewport.
  await page.setViewportSize({ width: 390, height: 664 });
  for (const path of ['/piele/duties?round=3', '/piele/decisions?round=4']) {
    await page.goto(path);
    await expect(page.locator('.page-loading')).toHaveCount(0);
    await expect(page.locator('.page-body')).toBeVisible();
    const size = await page.evaluate(() => ({
      footer: document.querySelector('.club-footer')!.getBoundingClientRect().bottom + scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight,
    }));
    expect(size.footer, `${path} is short`).toBeLessThan(size.innerHeight);
    expect(size.scrollHeight, path).toBe(size.innerHeight);
  }
  const largeViewportMinimums = await page.evaluate(() => {
    const boxes = ['html', 'body', 'app-root', 'app-shell', '.league']
      .map((selector) => document.querySelector(selector))
      .filter((box) => box !== null);
    const found: string[] = [];
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule && /\dvh/.test(rule.style.minHeight)) {
          const applies = boxes.some((box) => {
            try {
              return box.matches(rule.selectorText);
            } catch {
              return false;
            }
          });
          if (applies) found.push(`${rule.selectorText} { min-height: ${rule.style.minHeight} }`);
        } else if ('cssRules' in rule) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        visit(sheet.cssRules);
      } catch {
        // A cross-origin sheet (fonts) cannot be read.
      }
    }
    return found;
  });
  expect(largeViewportMinimums).toEqual([]);
});

test('desktop rail and top bar stay in view while the content scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/piele?round=2');
  const rail = page.locator('.season-rail');
  await expect(rail.getByRole('button', { name: 'Piele. Switch league' })).toBeVisible();
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
  const start = page.goto('/piele?round=2');
  await expect(page.getByRole('status', { name: 'Loading The Pavilion' })).toBeVisible();
  await start;
  await expect(page.locator('.league')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading The Pavilion' })).toHaveCount(0);

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
  await page.goto('/piele?round=2');
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
  await expect(strip).toBeHidden();
  await expect(page.getByText('ROUND 02 →')).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'League navigation', exact: true })
    .getByRole('link', { name: 'Home', exact: true })
    .click();
  await expect(strip).toBeVisible();
});

test('on a phone the fixture ribbon folds up under the round header and back down', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('/piele?round=3');
  await expect(page.getByRole('group', { name: 'Round 03 fixtures' })).toBeVisible();
  const bar = page.locator('.round-bar');
  await expect.poll(() => bar.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  const full = await bar.evaluate((el) => el.getBoundingClientRect().height);
  expect(full).toBeGreaterThan(40);
  // Waits for the bar's `mobile-empty` class to flip, then records the transitions that start
  // at that moment and the bar's height in each following frame until they end. Under a full
  // test run the browser may skip frames, so the transitions, not the samples, prove the slide.
  const fold = (empty: boolean) =>
    bar.evaluate(
      (el, empty) =>
        new Promise<{ transitions: string[]; frames: number[] }>((resolve) => {
          const observer = new MutationObserver(() => {
            if (el.classList.contains('mobile-empty') !== empty) return;
            observer.disconnect();
            getComputedStyle(el).marginBottom;
            const animations = el.getAnimations({ subtree: true });
            const transitions = animations.map((animation) =>
              animation instanceof CSSTransition ? animation.transitionProperty : animation.id,
            );
            const frames: number[] = [];
            const tick = () => {
              frames.push(el.getBoundingClientRect().height);
              if (animations.some((animation) => animation.playState === 'running'))
                requestAnimationFrame(tick);
              else resolve({ transitions, frames });
            };
            requestAnimationFrame(tick);
          });
          observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        }),
      empty,
    );
  const nav = page.getByRole('navigation', { name: 'Mobile league navigation' });

  const folding = fold(true);
  await nav.getByRole('link', { name: 'Duties', exact: true }).click();
  const out = await folding;
  // The drawer folds and the bar's margin closes together, the height never growing...
  expect(out.transitions).toEqual(expect.arrayContaining(['grid-template-rows', 'margin-bottom']));
  out.frames
    .slice(1)
    .forEach((height, i) => expect(height).toBeLessThanOrEqual(out.frames[i] + 0.5));
  // ...then the bar leaves the layout: no box, no margin, nothing extending the page past its footer.
  await expect(bar).toHaveCSS('display', 'none');
  const excess = await page.evaluate(() => {
    const nav = document.querySelector('.mobile-nav')!;
    const footer = document.querySelector('.club-footer')!.getBoundingClientRect().bottom;
    const padding = nav.getBoundingClientRect().height + parseFloat(getComputedStyle(nav).bottom);
    return (
      document.documentElement.scrollHeight - Math.max(innerHeight, footer + scrollY + padding)
    );
  });
  expect(Math.abs(excess)).toBeLessThanOrEqual(1);

  const unfolding = fold(false);
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  const back = await unfolding;
  expect(back.transitions).toEqual(expect.arrayContaining(['grid-template-rows', 'margin-bottom']));
  back.frames
    .slice(1)
    .forEach((height, i) => expect(height).toBeGreaterThanOrEqual(back.frames[i] - 0.5));
  await expect.poll(() => bar.evaluate((el) => el.getBoundingClientRect().height)).toBe(full);
});

test('captain creates, records and decides duties; the feed follows', async ({ page }) => {
  await page.goto('/piele/duties?round=2&scope=league');
  await expect(page.locator('.register-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'New duty' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Put it on the register.' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('09 Oct 2026 · 20:45 SAST');
  await chooseOption(dialog.getByLabel('Member'), { label: 'Johan' });
  await dialog.getByLabel('Reason').fill('Last place in Round 02.');
  await dialog.getByRole('button', { name: 'Create duty' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Round 02 Spoon duty created for Johan' }),
  ).toBeVisible();
  const card = page.locator('.register-card').filter({ hasText: 'Johan' });
  await expect(card).toContainText('Due 09 Oct · 20:45');
  await expect(card).toContainText('0 marks');
  await expect(card).toContainText('next 16 Oct · 20:45');
  await card.getByRole('button', { name: 'Record evidence' }).click();
  const evidence = page.getByRole('dialog').filter({ hasText: 'Record the evidence.' });
  await evidence.locator('input[type=file]').setInputFiles({
    name: 'proof.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('demo'),
  });
  await evidence.getByRole('button', { name: 'Record evidence' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Record when the duty was completed' }),
  ).toBeVisible();
  await expect(evidence.getByLabel('Completed at (SAST)')).toHaveClass(/problem-flag/);
  await expect(evidence.getByLabel('Completed at (SAST)')).not.toBeFocused();
  await evidence.getByLabel('Completed at (SAST)').fill('2026-09-20T09:00');
  await evidence.getByRole('button', { name: 'Record evidence' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Evidence recorded for Johan' }),
  ).toBeVisible();
  await expect(card).toContainText('Under review');

  await card.getByRole('button', { name: 'Void duty' }).click();
  const reason = page.getByRole('dialog').filter({ hasText: 'Void this duty?' });
  await reason.getByRole('button', { name: 'Void duty' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Give a reason' })).toBeVisible();
  await expect(reason.getByLabel('Reason')).toHaveAttribute('aria-invalid', 'true');
  await expect(reason.getByLabel('Reason')).toHaveClass(/problem-flag/);
  await expect(reason.getByLabel('Reason')).not.toBeFocused();
  await reason.getByLabel('Reason').fill('Created by mistake');
  await reason.getByRole('button', { name: 'Void duty' }).click();
  await expect(card).toContainText('Voided');
  await expect(card).toContainText('Created by mistake');

  // In-app navigation keeps the sample league's in-memory state; a reload would reset it.
  const nav = page.getByRole('navigation', { name: 'League navigation', exact: true });
  await nav.getByRole('link', { name: 'More', exact: true }).click();
  await page.getByRole('link', { name: /^Captain's desk/ }).click();
  await openSection(page, 'Evidence to decide.');
  const review = page.locator('.review-row').filter({ hasText: 'Liam' });
  await expect(review).toContainText('Counts from submission');
  await review.getByRole('button', { name: 'Accept' }).click();
  const accept = page.getByRole('dialog').filter({ hasText: 'Accept this evidence?' });
  await expect(accept).toContainText("closing the members' vote");
  await accept.getByRole('button', { name: 'Accept evidence' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'completed for Liam' })).toBeVisible();
  await expect(page.locator('.round-empty')).toContainText('Nothing needs your decision');

  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  const feed = page.locator('app-feed');
  await expect(feed.locator('.feed-item').nth(1)).toContainText(
    'Round 02 Pick confirmation completed',
  );
  await expect(feed.locator('.feed-item')).toHaveCount(11);
  // The list keeps a set height and scrolls, so switching scope does not resize the section.
  const list = feed.getByRole('region', { name: 'Round 02 feed' });
  const roundBox = (await feed.boundingBox())!;
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await feed.getByRole('button', { name: 'Season' }).click();
  await expect(feed.locator('.feed-item')).toHaveCount(14);
  const seasonList = feed.getByRole('region', { name: 'Season feed' });
  expect(await seasonList.evaluate((el) => el.scrollTop)).toBe(0);
  expect((await feed.boundingBox())!.height).toBe(roundBox.height);
  await expect(feed.locator('.feed-item').last()).toContainText('URC 2026/27 is open');
  await nav.getByRole('link', { name: 'Standings', exact: true }).click();
  await page.getByRole('button', { name: 'House marks' }).click();
  const arno = page.locator('.standing-row').filter({ hasText: 'Arno' });
  await expect(arno).toContainText('1 open duty');
  expect(Number(await arno.locator('strong').textContent())).toBeGreaterThanOrEqual(3);

  // A challenge upheld in Arno's favour clears his marks and restarts the clock.
  await page
    .getByRole('navigation', { name: 'Season timeline' })
    .locator('.round-stop')
    .first()
    .click();
  await nav.getByRole('link', { name: 'Duties', exact: true }).click();
  await page.getByRole('button', { name: 'League duties', exact: true }).click();
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
  await expect(
    page.locator('.standing-row').filter({ hasText: 'Arno' }).locator('strong'),
  ).toHaveText('0');
});

test('evidence dialog is centred on desktop and phone', async ({ page }) => {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [320, 700],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/piele?round=2');
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
