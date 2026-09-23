# Piele

Floodlights is the selected frontend design. The Angular prototype includes a round-scoped season timeline, jersey matchups, favourite-team styling and browser-local profile photos.

## Run

From this directory, run `npm run setup` and `npm start`. Open http://localhost:4200. First-time visitors choose a name and favourite team. Profile photos are optional. Use the avatar in the header to edit the profile.

The frontend uses Angular 22.1.7 with CLI 22.1.8. Dependencies and lockfile are in `apps/web`. Use a compatible Node 22.22.3+, 24.15+ or 26 release.

## Scope

- `apps/web`: Angular frontend. Read its `AGENTS.md` and `CLAUDE.md` before changes.
- `apps/api`: Backend root with adapted `CLAUDE.md` and an `AGENTS.md` pointer. No Python service or database is implemented yet.
- `fixtures`: Official public URC schedule snapshot and provenance.

The schedule contains 144 regular-season fixtures and seven playoff slots for 2026/27, checked on 23 September 2026. Dates and kickoff times come from the official URC match-centre feed, with times displayed in SAST. Playoff teams and kickoffs remain TBC. This is a local snapshot, not live synchronization. League standings and obligations are empty until an administration backend supplies them.

Profiles and processed photos persist only in this browser. There is no authentication, server upload or cross-device profile synchronization. The optional `?demo=1&round=2` URL retains synthetic league interactions for reviewing duties and votes. Those demonstration fixtures are separate from the default official schedule.

The supplied asset pack contains 12 team jerseys. Edinburgh, Leinster, Lions and Ospreys use illustrated supporter-shirt SVGs. These are visual placeholders, not official season kit reproductions.

## Verify

Run `npm run build`, `npm test` and `npm run test:e2e`. The browser suite covers onboarding, profile/photo persistence and errors, responsive layouts, jersey assets, round and playoff navigation, SAST times and personal styling. Screenshots are saved under `apps/web/test-results`.

From `apps/web`, `node scripts/import-urc.mjs` validates and converts the saved official fixture response. It rejects incomplete schedules, unknown teams and incorrect per-team home/away counts before replacing the generated fixture data. See `fixtures/README.md` for the source query.
