import { expect, Page } from '@playwright/test';

/**
 * A returning sample member: the browser-kept name and photo shared by every league, and a
 * favourite team in each listed league (`pavilion-team-v1:{slug}`). Runs before every page
 * load, like a member's own browser storage.
 */
export function seedProfile(
  page: Page,
  { displayName = 'Victor Dercksen', teamId = 'dhl-stormers', leagues = ['piele'] } = {},
): Promise<void> {
  return page.addInitScript(
    ({ displayName, teamId, leagues }) => {
      localStorage.setItem('pavilion-profile-v2', JSON.stringify({ displayName, photo: null }));
      for (const slug of leagues) localStorage.setItem(`pavilion-team-v1:${slug}`, teamId);
    },
    { displayName, teamId, leagues },
  );
}

/** A dropdown (`shared/dropdown`) found by its heading, with its heading row and chevron. */
export function dropdown(page: Page, heading: string) {
  const section = page
    .locator('section.dropdown')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) });
  const head = section.locator('.dropdown-head').first();
  return { section, head, chevron: head.locator('.chevron') };
}

/** Opens a dropdown, closed by default, from its chevron. */
export async function openSection(page: Page, heading: string): Promise<void> {
  const { section, chevron } = dropdown(page, heading);
  await chevron.click();
  await expect(chevron).toHaveAttribute('aria-expanded', 'true');
  await expect(section).not.toHaveClass(/animating/);
}

/**
 * Scrolls an open dropdown's body up under the shell's bars and checks its heading row stays
 * pinned just below the visible shell bars.
 */
export async function expectPinnedHeading(page: Page, heading: string): Promise<void> {
  const { head, chevron } = dropdown(page, heading);
  await head.evaluate((element) => {
    const top = element.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + 400);
  });
  await expect(head).toHaveClass(/stuck/);
  const gap = await head.evaluate((element) => {
    const bar = Math.max(
      document.querySelector('.top-bar')!.getBoundingClientRect().bottom,
      document.querySelector('.round-bar')!.getBoundingClientRect().bottom,
    );
    return Math.abs(element.getBoundingClientRect().top - bar);
  });
  expect(gap).toBeLessThan(2);
  await expect(chevron).toBeInViewport();
}

/**
 * Closes a pinned dropdown from the middle of its body and watches every frame until it settles:
 * the top bar and round header never move; the heading stays where it was on screen, under the
 * round header, unless the page has run out below it (the last dropdown on a page), when the page
 * rests at its end with the heading still in view; and the body only starts folding once the
 * scroll back to the heading has ended (`scrollend` before the fold, and no frame in which both
 * the scroll position and the body's height change), which is what keeps iOS Safari drawing the
 * shell's sticky bars.
 */
export async function expectClosesInPlace(page: Page, heading: string): Promise<void> {
  const { section, head, chevron } = dropdown(page, heading);
  const body = section.locator('.dropdown-body').first();
  await head.evaluate((element) => {
    const bars = [document.querySelector('.top-bar')!, document.querySelector('.round-bar')!];
    const section = element.parentElement!;
    const body = section.querySelector('.dropdown-body')!;
    const frames: { t: number; bars: number[]; head: number; y: number; body: number }[] = [];
    const marks = { scrollEnd: -1, foldStart: -1 };
    const sample = () =>
      frames.push({
        t: performance.now(),
        bars: bars.map((bar) => bar.getBoundingClientRect().top),
        head: element.getBoundingClientRect().top,
        y: scrollY,
        body: body.getBoundingClientRect().height,
      });
    sample();
    const started = performance.now();
    const tick = () => {
      sample();
      if (performance.now() - started < 2500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    addEventListener('scrollend', () => (marks.scrollEnd = performance.now()), { once: true });
    new MutationObserver(() => {
      if (marks.foldStart < 0 && section.classList.contains('animating')) {
        marks.foldStart = performance.now();
      }
    }).observe(section, { attributes: true, attributeFilter: ['class'] });
    Object.assign(window, { closeFrames: frames, closeMarks: marks });
  });
  await chevron.click();
  await expect(chevron).toHaveAttribute('aria-expanded', 'false');
  await expect(section).not.toHaveClass(/animating/);
  await expect(head).not.toHaveClass(/stuck/);
  await expect(body).toHaveAttribute('inert');
  await page.waitForTimeout(2600);
  const { frames, marks, atEnd } = await page.evaluate(() => {
    const w = window as unknown as {
      closeFrames: { t: number; bars: number[]; head: number; y: number; body: number }[];
      closeMarks: { scrollEnd: number; foldStart: number };
    };
    return {
      frames: w.closeFrames,
      marks: w.closeMarks,
      atEnd: scrollY + innerHeight >= document.documentElement.scrollHeight - 1,
    };
  });
  const [first] = frames;
  const scrolled = frames.some((frame) => frame.y !== first.y);
  // The scroll back ended before the body started folding.
  if (scrolled && marks.scrollEnd >= 0 && marks.foldStart >= 0) {
    expect(marks.foldStart, 'the fold started before the scroll ended').toBeGreaterThanOrEqual(
      marks.scrollEnd,
    );
  }
  frames.forEach((frame, index) => {
    frame.bars.forEach((top, bar) => expect(Math.abs(top - first.bars[bar])).toBeLessThan(1));
    if (!atEnd) expect(Math.abs(frame.head - first.head)).toBeLessThan(2);
    if (index === 0 || atEnd) return;
    const previous = frames[index - 1];
    // A frame that both scrolled and folded. Only a real single frame counts: on a busy
    // machine two samples can be far apart and straddle both, one after the other.
    const oneFrame = frame.t - previous.t < 25;
    const both = frame.y !== previous.y && frame.body !== previous.body;
    if (oneFrame && both) {
      throw new Error(
        `scrolled and folded in one frame: ${JSON.stringify(frames.slice(index - 2, index + 2))}`,
      );
    }
  });
  await expect(chevron).toBeInViewport();
}

/** Selects through the searchable Spartan popup, including options rendered in an overlay. */
export async function chooseOption(
  control: Locator,
  option: string | { label: string },
): Promise<void> {
  const page = control.page();
  const item =
    typeof option === 'string'
      ? page.locator('.pavilion-select-option').and(page.locator(`[data-value="${option}"]`))
      : page.getByRole('option', { name: option.label, exact: true });
  // On a slow runner the popup can close between opening and typing; reopen it and try again.
  await expect(async () => {
    if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click();
    await page
      .locator('.pavilion-select-search input')
      .fill(typeof option === 'string' ? option : option.label, { timeout: 3000 });
    await item.click({ timeout: 3000 });
  }).toPass({ timeout: 20000 });
  await expect(control).toHaveAttribute('aria-expanded', 'false');
  if (typeof option === 'string') await expect(control).toHaveAttribute('data-value', option);
  else await expect(control).toContainText(option.label);
}
