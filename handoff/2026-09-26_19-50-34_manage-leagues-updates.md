# Manage Leagues page updates

Branch `claude/manage-leagues-updates-m4ymr5`, on top of master's `e9e6395`. No pull request opened.

## Request

On `/manage`: replace the preset emblems with the owner's new set (seven gold PNGs), make the
join-link copy button icon-only, make "Appoint a captain" read as a button that opens a panel,
use "Sample Name" as the League name placeholder, choose the time zone from a preset list of all
IANA zones, turn the team sheet into rows of Name, Surname and Superbru name with "+ Add member",
make every league card expandable and make "Start a league" a dropdown.

## Completed

- Emblems: `ball`, `posts`, `jersey`, `boot`, `scrum`, `wings`, `trophy` replace `oak` … `star`.
  The PNGs were masked to their gold pixels (the yellow and red specks dropped), traced with
  potrace and written as `public/assets/images/emblems/{key}.svg`, one filled path in the
  `#emblem` group using `currentColor`, so the accent colour still tints them. `emblems.ts`,
  the API's `EMBLEM_PRESETS` and all tests and samples use the new keys (Pofadder Bowl: `posts`).
- Migration `supabase/migrations/20260927090000_emblem_presets_v2.sql` moves leagues on a
  retired preset to a new one (oak→ball, anvil→posts, lantern→jersey, compass→boot,
  chevron→scrum, crown→trophy, wave→wings, star→ball). Not applied to any database here.
- League cards (`league-card`) start closed: crest, name, `/slug · URC · 6 members`, status and a
  chevron button "Details of {League}" (`aria-expanded`, hit area the whole head). The body holds
  the facts, actions, rename form and captain panel.
- Join code copy: icon button (copy icon, check once copied, "Copied" status kept).
- "Appoint a captain": `<details>` summary drawn as a bordered pill with a crown and a chevron
  that turns when open; the panel is boxed below.
- Time zone: a select in the new-league form and the rename form, built by
  `features/manage/time-zones.ts` from `Intl.supportedValuesOf('timeZone')` plus UTC, grouped by
  region with the current GMT offset ("Johannesburg (GMT+2)"). A saved zone missing from the
  list is kept as a "Current" option.
- Team sheet: `FormArray` of rows (Name, Surname (optional), Superbru name), three blank rows to
  start, "Add member" appends a row and focuses it, an X removes one (at least one row stays, at
  most 200). `member-rows.ts` (`checkMembers`) replaces `members-parser.ts`: blank rows skipped,
  full name = name + surname, one error per unusable row on the input to fix, shown after a
  submit attempt (a repeated Superbru name at once). Column headings label the rows on wide
  screens; each row shows its own labels on phones.
- "Start a league." is a full-width disclosure button; the form is hidden, not destroyed, when
  closed. League name placeholder is "Sample Name".
- Fixed in passing: the captain reset on team-sheet changes read the form's value signal, which
  updates after the array's event; it now reads the rows directly.
- Docs: `apps/web/CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/api/README.md`.

## Checks run (web with Node 24.21 via `npx node@24`)

- `ng test --watch=false`: 193 passed (new `member-rows.spec.ts`, `time-zones.spec.ts`,
  reworked `create-league-form.spec.ts`).
- `ng build`: passed, no warnings.
- Playwright, full suite: 45 passed (after updating `leagues.spec.ts` from Crown to Trophy).
  Run with a temporary config pointing at the preinstalled Chromium 1194; removed afterwards.
- API `uv run --frozen pytest -q`: 81 passed, 84 skipped (database tests need Postgres).
- Screenshots checked at 1440 px and 360 px.
- `npm run test:e2e:production` not run.

## Next steps

- Apply the migration to the Supabase project when deploying, before or with the API change,
  so no league keeps a preset the web no longer draws (it would fall back to its monogram).
