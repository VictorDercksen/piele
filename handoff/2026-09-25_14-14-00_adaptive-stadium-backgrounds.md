# Adaptive stadium backgrounds and restored club banners

Recorded on 25 September 2026 in Africa/Johannesburg time.

## Request and completed result

The user requested stronger club banners, adaptive stadium backgrounds throughout the application, animated artwork changes and live team artwork in the profile editor. During implementation, the user chose to remove the duplicate image inside match cards, enlarge the banners again and hide the top-right viewing-round label on Home and the match centre.

The final layout uses one stadium scene behind the page. Match cards have enlarged club banners, crests and patterns over a translucent surface, with no separate stadium image or empty panorama space inside the card.

- Home follows the featured fixture's venue, including selection through the fixture ribbon.
- Match-centre routes follow the fixture ID in the URL, including direct links.
- Other shell pages use the saved favourite team's primary stadium.
- The profile and onboarding editor preview the currently selected team's stadium before saving. Cancel does not persist the selection.
- Unknown or alternate match venues use the existing generic ground rather than an incorrect primary venue.
- The viewing-round note is hidden on Home and match-centre headings. Other page scope notes and the round selector remain.
- The horizontal divider beneath the Home and match-centre headings is also removed, per the user's final refinement.

## Implementation

Added `shared/stadium-backdrop`, a decorative two-layer component that decodes images before switching and crossfades over 650 ms. It cancels stale async results when selections change, retains the current scene during loading and falls back to the generic artwork on failure. Reduced-motion users get an immediate switch. Only opacity is animated, not page content.

`ClubTeam.stadiumBackground` names the existing WebP asset for each team. The venue catalogue uses that property. `core/layout/shell` chooses the background from route, featured match and profile state, and applies a dark gradient for content contrast. `features/profile/profile-editor` uses the same component for its poster. `features/home/match-hero` no longer owns background-image logic.

## Verification

- Production build passed without warnings. Initial bundle: 635.17 kB.
- Targeted unit tests: 11 passed across stadiums, match-artwork and stadium-backdrop. Covers stale image loads and failed-image fallback.
- Browser tests: 6 passed across profile-and-layout and stadium-backgrounds. Covers fixture and page navigation, single page artwork, hidden scope note, profile preview/save/cancel, quick team changes, reduced motion, image validation and desktop-to-320px layouts.
- Inspected final desktop/mobile Home and profile screenshots under `outputs/adaptive-*-final.png`.
- Prettier checks and `git diff --check` passed.

One initial unit assertion ran before the fallback decode promise settled. Changed the test to wait for the displayed fallback, then reran successfully.

## Running environment

The Angular MCP server remains at `http://localhost:4200/`. Browser tests use the ignored `.angular/stadium-playwright.config.ts` from the preceding session to target localhost rather than 127.0.0.1. Angular MCP best-practices retrieval still returns `Unexpected response type`; repository guidance was followed.

All prior asset imports and uncommitted changes remain. No commit or deployment was requested. Ready for user review.
