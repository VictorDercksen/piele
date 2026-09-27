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
 * pinned just below the round header, drawn as a bar.
 */
export async function expectPinnedHeading(page: Page, heading: string): Promise<void> {
  const { head, chevron } = dropdown(page, heading);
  await head.evaluate((element) => {
    const top = element.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + 400);
  });
  await expect(head).toHaveClass(/stuck/);
  const gap = await head.evaluate((element) => {
    const bar = document.querySelector('.round-bar')!.getBoundingClientRect().bottom;
    return Math.abs(element.getBoundingClientRect().top - bar);
  });
  expect(gap).toBeLessThan(2);
  await expect(chevron).toBeInViewport();
}

/**
 * Closes a pinned dropdown from the middle of its body and watches every frame until it settles:
 * the top bar and round header never move; the heading stays where it was on screen, under the
 * round header, unless the page has run out below it (the last dropdown on a page), when the page
 * rests at its end with the heading still in view; and the page never scrolls in the same frame
 * as the body folds (the scroll back to the heading comes first, the fold once the page is at
 * rest), which is what keeps iOS Safari drawing the shell's sticky bars.
 */
export async function expectClosesInPlace(page: Page, heading: string): Promise<void> {
  const { section, head, chevron } = dropdown(page, heading);
  const body = section.locator('.dropdown-body').first();
  await head.evaluate((element) => {
    const bars = [document.querySelector('.top-bar')!, document.querySelector('.round-bar')!];
    const body = element.parentElement!.querySelector('.dropdown-body')!;
    const frames: { bars: number[]; head: number; y: number; body: number }[] = [];
    const sample = () =>
      frames.push({
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
    (window as unknown as { dropdownFrames: typeof frames }).dropdownFrames = frames;
  });
  await chevron.click();
  await expect(chevron).toHaveAttribute('aria-expanded', 'false');
  await expect(section).not.toHaveClass(/animating/);
  await expect(head).not.toHaveClass(/stuck/);
  await expect(body).toHaveAttribute('inert', '');
  await page.waitForTimeout(2600);
  const { frames, atEnd } = await page.evaluate(() => ({
    frames: (
      window as unknown as {
        dropdownFrames: { bars: number[]; head: number; y: number; body: number }[];
      }
    ).dropdownFrames,
    atEnd: scrollY + innerHeight >= document.documentElement.scrollHeight - 1,
  }));
  const [first] = frames;
  frames.forEach((frame, index) => {
    frame.bars.forEach((top, bar) => expect(Math.abs(top - first.bars[bar])).toBeLessThan(1));
    if (!atEnd) expect(Math.abs(frame.head - first.head)).toBeLessThan(2);
    if (index === 0 || atEnd) return;
    const previous = frames[index - 1];
    const scrolled = frame.y !== previous.y;
    const folded = frame.body !== previous.body;
    // Never both in one frame.
    expect(scrolled && folded).toBe(false);
  });
  await expect(chevron).toBeInViewport();
}
