# CLAUDE.md

Adapted from CtrlFleet/src/fc-app-web/CLAUDE.md for the Piele frontend. This file is the frontend coding guide for all agents.

## Session handoffs

Before starting work, read the latest Markdown handoff in [../../../handoff/](../../../handoff/), selected by the timestamp in its filename. Before ending each session, write a new handoff there named `YYYY-MM-DD_HH-mm-ss_<feature>.md`, using Africa/Johannesburg local time and a short kebab-case feature name. Record the request, completed changes, relevant files, checks actually run and their results, unresolved issues and next steps. Distinguish completed work from proposed work. Preserve previous handoffs and never include secrets.

## Project and authority

Piele is a private rugby league application. Read ../../../piele-application-plan.md and ../../../piele-application-design.md from the repository root context (the source documents are one level above the piele monorepo). User decisions take precedence over proposed plan defaults. Floodlights is the selected design. Preserve the round-scoped season timeline on desktop and mobile.

The application is a routed first version without authentication. Published competition fixtures come from the local URC snapshot. League records (standings, duties, polls, captain reviews) come from the `LeagueData` provider: `SampleLeagueData` in development builds, clearly labelled as sample records, and `EmptyLeagueData` in production until an HTTP implementation backed by the Python API replaces it. Browser-local profile preferences remain a stopgap until the identity API is implemented.

## Actual stack

Angular 22 standalone components, signals, zoneless change detection, TypeScript, RxJS and component SCSS. The CLI uses @angular/build:application. Local fonts, crest, jerseys and team artwork live in public/assets. Spartan is the selected component library. Its CLI and MCP are installed as local development dependencies, with the MCP configured in the workspace's .codex/config.toml. The generated Slate theme lives in src/styles.scss, with dark mode enabled on the root HTML element and Titillium Web as the theme font. Tailwind 4 is compiled through .postcssrc.json. Spartan Brain and Angular CDK are installed for the theme preset. No Helm components have been generated yet. Firebase, Angular Material and CtrlFleet services are not installed. Do not introduce them solely to match the source guide.

Use the Icon component in `shared/icon` and accessible native controls until the relevant controls are migrated to Spartan. Shared Floodlights primitives (tags, buttons, tabs, empty states, dialogs) live in `src/styles/ui.scss`. Everything else is component-scoped SCSS. Use native dialog focus handling in the prototype. Angular CDK is available for later overlays. Keep branding in shared CSS custom properties. Bind data-driven team colours through style properties, never unsanitized HTML or CSS strings.

## Component and state rules

1. Use standalone components and ChangeDetectionStrategy.OnPush.
2. Use input(), output(), viewChild() and viewChildren(). Do not add decorator-based input/output or query APIs.
3. Use signal() for mutable display state, computed() for derived state and readonly fields for immutable configuration. Prefer readonly arrays for static catalogues.
4. Inject dependencies using inject() fields. Constructors are for initialization only.
5. Use native @if, @for and @switch. Track collections by stable IDs.
6. Use typed reactive forms for new profile and onboarding forms. Do not use two-way ngModel bindings with signals. Read changing form state reactively when used in template conditions.
7. Avoid any. Narrow DOM events with typed handlers. Do not scatter $any casts through new templates.
8. Keep asynchronous I/O and persistence in services. Do not call services directly from templates. Prefer computed state over effects. Use afterRenderEffect only for DOM work.
9. For RxJS, use observer objects in subscribe and takeUntilDestroyed for teardown. Do not maintain Subscription lists.
10. Use host metadata instead of HostListener/HostBinding. Keep imports and providers at the bottom of component metadata with one item per line when there is more than one.
11. Put component-local interfaces after the class or in dedicated model files. Layout: `src/app/core` for app-wide services, data sources, guards and the shell (`core/layout`), `src/app/features/<page>` for routed pages and their dialogs, `src/app/shared` for reusable presentational components. Each page is a lazy route in `app.routes.ts`, titled through route `data`. The selected round lives in the `round` query parameter via `SelectedRoundService`, and pages read round-scoped league data from `RoundViewService`.
12. Use SCSS classes for layout. Inline style bindings are for genuinely data-driven values such as favourite-team colours.
13. Build responsive layouts that share behaviour. Separate mobile components only when interaction differs materially. Do not duplicate business state for desktop and mobile.
14. Never put secrets or privileged Supabase keys in frontend files. Route guards do not provide authorization. Production mutations go through the planned Python API.
15. Validate browser-stored preferences before using them. Handle unavailable storage, invalid files and image decoding errors with visible feedback. Never claim browser-local profile changes were saved to a server.

## UI conventions

Use Floodlights' dark rugby presentation, original action artwork, jerseys for matchups and restrained accents. Personal cards, avatars and the current member's rows use their favourite team's colour and artwork. Preserve readable contrast regardless of club palette. Status colours remain consistent and always have text labels.

Every form control has a visible label. Icon-only controls have accessible names. Keep keyboard focus visible and restore focus when dialogs close. Provide empty, loading and error states. Check 320 px phone layouts and desktop layouts. Selected rounds must scope fixtures, results, standings, duties, decisions and captain reviews consistently. Constitution and account settings are explicitly season-wide or account-wide.

## Data and project boundaries

Use feature folders as features grow, services for domain I/O, and dedicated models for shared contracts. The backend sibling is ../api and its guide is ../api/CLAUDE.md. Generate API types from OpenAPI when a real API exists. Do not invent endpoints or migrations merely for a visual change.

Store fixture source, season and retrieval date alongside imported schedule data. Preserve unknown dates and times as unknown. Do not substitute another season or manufacture results. Kickoffs are absolute UTC timestamps with explicit display timezone Africa/Johannesburg. Schedule changes must not automatically change confirmed house deadlines.

## Commands and verification

From apps/web:

- npm start starts the local Angular server.
- npm run build produces the production build.
- npm test -- --watch=false runs Vitest component and logic tests.
- npm run test:e2e runs Playwright against the local server. Set PIELE_WEB_PORT when port 4200 is taken by another app, because the config reuses an existing server on that port.

Prefer the Angular MCP for workspace discovery, best practices, builds, tests and server lifecycle when available. Consult current Angular documentation for uncertain APIs. The build must pass with no new unused-import warnings. Test changed logic and relevant browser journeys, including round scoping, profile persistence, image validation and mobile overflow. Do not claim a test passed without running it. Avoid unrelated cleanup or speculative abstractions.
