# Pool picks: Save and Cancel beside the margin; no split for a pool of one

Recorded on 2026-10-01 in Africa/Johannesburg time. Branch `claude/pick-form-foot-sway`, from `master` at `a8cae6a`.

## Request

From a phone screenshot of the match page's Pool picks card while editing a pick:

1. Move Save pick and Cancel next to the margin stepper, in an aesthetic way. On a phone the two actions wrapped under the stepper.
2. Hide the percentage for each team while only the member's own pick is visible, so the bar never shows "100%" for a pool of one. Other members' picks stay hidden as before.

## Changes

1. **One-row form foot** (`features/match/picks-panel/picks-panel.scss`, `.html`).
   - `.form-foot` no longer wraps. The margin field keeps its width; `.form-actions` takes the rest, right-aligned.
   - Save pick grows to fill the row (capped at 240 px) at the stepper's 44 px height. Cancel keeps its natural width beside it.
   - Under 480 px (container query) Cancel keeps only its X icon: the "Cancel" text moves into a visually hidden span, so the accessible name is unchanged and the e2e locator still finds it. The stepper (132 px), Save and Cancel fit a 320 px phone without horizontal overflow.
2. **Split waits for a pool** (`picks-panel.ts`).
   - `sway` now returns null unless some visible row that is not the member's own has a side or a draw. Before, any row with a side counted, so a member who had just picked saw their own side at 100%.
   - The pool table still shows the member's own row behind the chevron; only the percentages are withheld.
3. **Tests.**
   - `picks-panel.spec.ts`: a case with only the member's own row in the pool expects no `.sway`, and after Edit expects the margin field, Save pick and Cancel inside `.form-foot`.
   - `e2e/superbru.spec.ts`: after saving the first pick, the pool opens with one row and no split, instead of "Stormers 100%, Sharks 0%".

## Checks run

- `npx ng test --watch=false --include='**/picks-panel/picks-panel.spec.ts'`: 16 passed.
- `npx ng test --watch=false` (full web suite): passed.
- `npm run build`: clean, no new warnings.
- `npx prettier --check` on the changed files: clean.
- `npx playwright test e2e/superbru.spec.ts` against `ng serve` on port 4300: 6 passed. The container's Playwright had no browser of its pinned revision, so a throwaway config pointed `launchOptions.executablePath` at the pre-installed Chromium; the repo config is unchanged.
- Screenshots of the foot at 320, 390 and 600 px viewports with the dev server and sample data: one row, `scrollWidth` equal to the viewport at each width.

The container's Node (22.22.0) is below the Angular CLI minimum (22.22.3); Node 24.15.0 was downloaded to the session scratchpad for these checks.

## Unresolved

None known.

## Next steps

- If the icon-only Cancel on narrow phones should keep its label instead, drop the `.cancel-label` rule in the 480 px container query and let Save shrink; both fit at 320 px only if Save loses its padding.
