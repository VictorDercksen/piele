# Rugby atmosphere restyle

Request: Give the app the physical feeling of rugby: grass, mud, sweat, lights and fans, while retaining a clear working interface.

Completed:
- Added an original illustrative night-ground photograph with wet turf, churned mud, packed stands and floodlights. Used as a decorative shell and matchup background, without promotional copy.
- Added a small SVG grain texture and shared night/chalk/artwork tokens.
- Restyled navigation, season timeline, fixture strip, headings and buttons with worn surfaces, warm chalk type and stronger sporting typography.
- Extended the treatment to home, rounds, standings, duties, decisions and profile. Preserved team colours and text-based status labels.
- Kept the previous club-banner matchup and relocated stadium/action row.
- Reduced tablet navigation spacing after visual QA found overflow at 801px.
- Extended the existing responsive test to 1051, 900 and 801px. Changed the sticky rail assertion to allow less than one pixel of browser rounding at the document bottom.

Relevant files: apps/web/src/styles.scss, styles/ui.scss, core/layout/{shell,season-timeline,fixture-ribbon} styles, features/{home,rounds,standings,duties,decisions,profile} styles, e2e/profile-and-layout.spec.ts and e2e/season-timeline.spec.ts.

Assets:
- apps/web/public/assets/editorial/match-night-ground.png (1536 x 1024, approximately 2.73 MB, copied into workspace).
- apps/web/public/assets/editorial/surface-grain.svg (code-native surface detail).
The photograph is an anonymous generated ground, not a representation of the selected fixture's actual stadium. No runtime image-generation service or new dependencies.

Verification:
- Final production build passed without warnings. Initial bundle 375.50 kB.
- Final browser suite: all 10 tests passed.
- Temporary page QA: 54 page/viewport combinations passed, across Home, Rounds, Standings, Duties, Decisions and Profile at 1440, 1100, 1051, 1024, 900, 801, 768, 390 and 320px. No horizontal overflow, page errors or failing asset responses.
- Desktop and phone screenshots reviewed, including Home, Rounds and Duties.
- git diff --check passed.
- Unit tests not rerun for this styling-only change.
- Angular best-practices MCP returned an unexpected response error. Local frontend guide followed.

No unresolved implementation issues. Dev server remains at localhost:4300. No commit or deployment performed.

## Image generation

Mode: built-in imagegen.
Final saved asset: apps/web/public/assets/editorial/match-night-ground.png.
Prompt:

Use case: photorealistic-natural. Asset type: atmospheric background photograph for a dark rugby club web app, wide landscape 1536x1024. A real-feeling rugby union ground at night in rain, shot from very low at the touchline. Foreground wet coarse grass, torn turf, boot divots, dark mud and an irregular worn white chalk touchline receding into the field. Packed distant stands with indistinct fans across the upper third, mist and hard white stadium floodlights glowing near upper left and upper right. Tiny out-of-focus rugby players far away, no identifiable people. Deep blue-black night, muted natural turf green, earthy brown and warm off-white light. Tactile editorial sports photography, restrained film grain, damp physical match-day atmosphere. Leave the middle relatively dark and quiet for interface overlays, strongest light at edges. No words, no signage text, no logos, no watermarks, no UI, no artificial neon, no illustrated look. This is an anonymous illustrative ground, not a named real stadium.
