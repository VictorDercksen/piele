import { Page } from '@playwright/test';

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
