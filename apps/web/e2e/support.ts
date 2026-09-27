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
 * the top bar and round header never move, and the heading stays where it was on screen, under
 * the round header, unless the page has run out below it (the last dropdown on a page), when the
 * page rests at its end with the heading still in view.
 */
export async function expectClosesInPlace(page: Page, heading: string): Promise<void> {
  const { section, head, chevron } = dropdown(page, heading);
  await head.evaluate((element) => {
    const bars = [document.querySelector('.top-bar')!, document.querySelector('.round-bar')!];
    const frames: { bars: number[]; head: number }[] = [];
    const sample = () =>
      frames.push({
        bars: bars.map((bar) => bar.getBoundingClientRect().top),
        head: element.getBoundingClientRect().top,
      });
    sample();
    const started = performance.now();
    const tick = () => {
      sample();
      if (performance.now() - started < 800) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    (window as unknown as { dropdownFrames: typeof frames }).dropdownFrames = frames;
  });
  await chevron.click();
  await expect(chevron).toHaveAttribute('aria-expanded', 'false');
  await expect(section).not.toHaveClass(/animating/);
  await expect(head).not.toHaveClass(/stuck/);
  await page.waitForTimeout(850);
  const { frames, atEnd } = await page.evaluate(() => ({
    frames: (window as unknown as { dropdownFrames: { bars: number[]; head: number }[] })
      .dropdownFrames,
    atEnd: scrollY + innerHeight >= document.documentElement.scrollHeight - 1,
  }));
  const [first] = frames;
  for (const frame of frames) {
    frame.bars.forEach((top, index) => expect(Math.abs(top - first.bars[index])).toBeLessThan(1));
    if (!atEnd) expect(Math.abs(frame.head - first.head)).toBeLessThan(2);
  }
  await expect(chevron).toBeInViewport();
}
