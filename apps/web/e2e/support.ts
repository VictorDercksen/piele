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

/** Opens a dropdown (`shared/dropdown`), closed by default, from the chevron named by its heading. */
export async function openSection(page: Page, heading: string): Promise<void> {
  const chevron = page.getByRole('button', { name: heading, exact: true });
  await chevron.click();
  await expect(chevron).toHaveAttribute('aria-expanded', 'true');
}

/**
 * Scrolls an open dropdown's body up under the shell's bars and checks its heading row stays
 * pinned just below the round header, drawn as a bar.
 */
export async function expectPinnedHeading(page: Page, heading: string): Promise<void> {
  const chevron = page.getByRole('button', { name: heading, exact: true });
  const head = page.locator('.dropdown-head', { has: chevron });
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
