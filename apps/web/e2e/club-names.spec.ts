import { expect, test } from '@playwright/test';

// Round 1 features all sixteen clubs across its eight fixtures.
const ROUND_ONE = ['292584', '292585', '292586', '292587', '292588', '292589', '292590', '292591'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'pavilion-profile-v1',
      JSON.stringify({ displayName: 'Victor Dercksen', teamId: 'dhl-stormers', photo: null }),
    ),
  );
  await page.route('**/v1/**', (route) => route.fulfill({ status: 503, body: 'down' }));
});

for (const width of [320, 360, 390, 768, 1440]) {
  test(`club names in the match banner never break inside a word at ${width}px`, async ({
    page,
  }) => {
    const failures: string[] = [];
    await page.setViewportSize({ width, height: 950 });
    for (const id of ROUND_ONE) {
      await page.goto(`/match/${id}?round=1`);
      await expect(page.locator('app-match-hero h2').first()).toBeVisible();
      const broken = await page.locator('app-match-hero h2').evaluateAll((titles) =>
        titles.flatMap((title) => {
          const style = getComputedStyle(title);
          const probe = document.createElement('span');
          probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${style.font};text-transform:${style.textTransform};letter-spacing:${style.letterSpacing}`;
          document.body.append(probe);
          const words = (title as HTMLElement).innerText.trim().split(/\s+/);
          const wide = words.filter((word) => {
            probe.textContent = word;
            return probe.getBoundingClientRect().width > title.clientWidth + 0.5;
          });
          probe.remove();
          return wide;
        }),
      );
      failures.push(...broken);
    }
    expect(failures).toEqual([]);
  });
}
