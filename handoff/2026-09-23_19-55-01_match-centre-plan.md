# Match centre plan: remove Rounds, add match details page

Request: Remove the Rounds page completely. "Enter the match centre" on the home hero should open the currently featured fixture on a new match details page showing the latest teamsheets, betting odds, weather and related match information. Plan only; present for approval.

Status: PROPOSED. No code changed in this session. Everything below is a plan awaiting approval.

## Findings

- `/rounds` (`apps/web/src/app/features/rounds/`) lists the selected round's fixtures as cards. The shell's fixture ribbon (`core/layout/fixture-ribbon`) already lists the same fixtures on every page and picks the featured fixture (`RoundViewService.featured`), so the page duplicates it.
- Two things only the Rounds page shows: the schedule-source block (season, fixture count, snapshot date, official source link) and the house pick deadline banner with the Superbru link. Both need a new home.
- `/rounds` is referenced by: `app.routes.ts`, `shell.ts` nav and mobileNav, `home.page.html` (`(explore)="go('/rounds')"`), `notifications-flag.ts` (round item path), and e2e specs `profile-and-layout.spec.ts` and `season-timeline.spec.ts` (fixture-card counts and Rounds nav clicks).
- The featured fixture lives in an in-memory signal, not the URL, so a match page needs its own route parameter.
- The URC GraphQL feed (`fixtures/README.md`) currently supplies only the schedule. Lineup fields are unverified. Container egress blocks unitedrugby.com, the-odds-api.com and open-meteo.com, so provider verification must run from the user's machine.
- The API is a health-only FastAPI scaffold with no tables or migrations. `httpx` is a dev dependency only.
- `piele-application-plan.md` section 2 says not to build betting. Displaying odds for information is a user decision that overrides that default; it should be labelled information-only.

## Proposed plan

Phase 0 (spike, user's machine): verify URC GraphQL lineup/officials fields, The Odds API URC sport key and Open-Meteo forecast; choose fallbacks.
Phase 1 (frontend): delete Rounds, add `/match/:fixtureId` page, rewire hero, ribbon, notifications, e2e tests; move schedule source to More and deadline banner to the match page.
Phase 2 (API): `GET /v1/matches/{fixture_id}` aggregating teamsheets, odds and weather with per-section status, provider modules, settings, first Alembic migration for a snapshot cache table.
Phase 3 (frontend data): `MatchCentreService` over HttpClient with loading, unavailable and not-published states; Playwright route mocks.
Phase 4: verification, handoff, README updates.

Checks run: none (planning only). Repo commands were read, not executed.

Next steps: await approval of the plan presented in chat, then start with Phase 0 commands.
