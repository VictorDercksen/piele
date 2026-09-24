# Home matchup club banners

Request: Remove the home overview eyebrow and viewing-round note, replace the promotional photo and copy with a larger banner-based matchup, relocate the match centre action, and improve stadium presentation.

Completed:
- Hide the eyebrow and scope note on Home only. Preserve the page title, round controls and timeline.
- Replace the promotional hero and matchup jerseys with two large club banners, kickoff/result, home/away labels and favourite-team indication.
- Display the stadium in a dedicated footer with a stadium icon and the existing match centre action. Navigation preserves the selected round.
- Download all 16 official URC club patterns and SVG crests. URC constructs its banners from these assets and club colours, rather than providing flattened banner images. Local sources.json records source URLs and retrieval date.
- Update the existing browser checks for banner assets, removed labels, stadium visibility and relocated navigation.

Files: apps/web/src/app/features/home/match-hero/*, core/layout/shell/shell.html and shell.ts, core/competition/club-banners.ts, public/assets/images/club-banners/*, e2e/profile-and-layout.spec.ts.

Verification:
- Production build passed without warnings. Initial sandbox attempt failed on filesystem traversal permissions, then passed outside the sandbox.
- Unit tests: 10 passed.
- Browser suite: 9 passed initially, 1 failed solely because the new assertion expected ROUND 2 instead of the existing ROUND 02. Corrected the assertion and reran that responsive test successfully.
- Browser checks cover widths 1440, 1280, 768, 390 and 320, image loading, profile journeys, round scoping and fixture switching. Desktop and mobile screenshots reviewed.
- All 16 SVG crests parsed and all 16 JPEG patterns verified.
- git diff --check passed.

No unresolved implementation issues. Angular dev server remains available on localhost:4300. No deployment or commit performed.
