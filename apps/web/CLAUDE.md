# Frontend agent guide

## Start and finish

- User instructions take precedence. Keep changes within the requested scope. Preserve unrelated work. Do not add speculative abstractions, services, or features.
- Read the latest timestamped Markdown file in [../../../handoff/](../../../handoff/) before work. Before ending, write `YYYY-MM-DD_HH-mm-ss_<feature>.md` there using Africa/Johannesburg time. Record the request, changes, files, actual checks/results, unresolved issues, and next steps. Preserve earlier handoffs and exclude secrets.
- Product name: **The Pavilion**. **Piele** is its first league. Keep `PIELE_*`, the `piele` database schema, and `piele-crest.png` names.
- Product decisions live in `../../../piele-application-plan.md` and `../../../piele-application-design.md`. Consult relevant sections for product changes. Report missing sources rather than inventing requirements. Backend rules: [../api/CLAUDE.md](../api/CLAUDE.md).

## Stack and coding rules

Angular 22, standalone components, zoneless change detection, TypeScript, RxJS, SCSS, Tailwind 4, Spartan Brain/Helm, Angular CDK, and Lucide through `@ng-icons`. The build uses `@angular/build:application`. Do not introduce Angular Material, Firebase, or unrelated frameworks.

- `OnPush` is the default in Angular 22. New components omit `changeDetection`. Existing explicit declarations may stay. Use `input()`, `output()`, `viewChild()`, and `viewChildren()`. Use `inject()` fields. Constructors initialize only.
- Mutable display state uses `signal()`. Derived state uses `computed()`. Keep immutable fields and static catalogues readonly. Prefer computed state over effects. Use `afterRenderEffect` only for DOM work.
- Use `@if`, `@for`, and `@switch`, tracking stable IDs. Use typed reactive forms. Do not combine two-way `ngModel` with signals. Read changing form state reactively in template conditions.
- Avoid `any` and template `$any`. Narrow DOM events in typed handlers.
- Keep I/O and persistence in services. Do not call services directly from templates. RxJS subscriptions use observer objects and `takeUntilDestroyed`, not subscription lists.
- Use `host` metadata instead of `HostListener`/`HostBinding`. Put `imports`, `providers`, and `viewProviders` last in component metadata, with one entry per line for multiple entries.
- Use SCSS classes for layout. Bind only data-driven style values, such as team colours. Never interpolate unsanitized HTML or CSS. Share business state between desktop and mobile.
- Never expose secrets or privileged Supabase keys. Guards select routes. The API authorizes requests. Validate stored preferences and handle unavailable storage, invalid files, and image decoding failures visibly.

## Structure and services

These rules follow the Angular style guide and Angular's AI best practices. They apply to new and changed code.

- Organize by feature area. Never create type folders such as `services/`, `models/`, `components/`, or `tests/`. Split a crowded folder by feature, not by file type.
- Specs sit beside the file they test as `<file>.spec.ts`. One concept per file.
- League entities live in `core/league/<entity>/`. Each has `<entity>.service.ts` (`<Entity>Service`) for reads and `<entity>-control.service.ts` (`<Entity>ControlService`) for mutations, plus `<entity>.models.ts` for its view types. Profile follows the same pair in `core/profile`.
  - Read services expose signals and `computed()` read models, plus read helpers that take an argument and read signals. They never mutate.
  - Control services call the data layer and return Promises. They hold no exposed state. A control service may inject its read service. A read service never injects a control service.
  - Expose state as signals, not observables. RxJS stays inside transports and time-based streams.
  - Add an entity service only for an entity components need. Do not create an empty control service for a read-only entity.
- The data layer is `core/league/data/` (`LeagueData`, HTTP, sample, and empty implementations) and `core/league/admin/admin-data.ts`. Only entity services, `LeagueContext`, and the join services inject it. Components, pages, guards, and layout never inject `LeagueData`, `AdminData`, or `HttpClient`. Specs may provide `SampleLeagueData` for `LeagueData`.
- New root services use `@Service()` from `@angular/core`. Use `@Service({ factory })` to choose between implementations. Existing `@Injectable` infrastructure services may stay until they are otherwise changed.
- Components are presentation. They keep injected services, display signals, form wiring, focus, dialogs, and alert calls. Move interfaces and type aliases to `<component>.models.ts`. Move typed form factories, parsing, validation rules, payload building, change diffing, and refusal-code maps to co-located pure files named for the concept, such as `<component>.form.ts`. Move sequences of API calls into the entity control service.

## Where to work

Paths below are relative to `src/app`.

| Task | Owner and required boundary |
| --- | --- |
| Routes, sign-in, league switching | `app.routes.ts`, `core/auth`, `core/league/league-context.ts`, `league.guards.ts`, `league-slugs.ts`. Keep pages and the shell lazy. |
| Round selection and page data | `SelectedRoundService`, `core/competition/fixture.service.ts` (round, live-merged fixtures, featured fixture), and the round-scoped read services in `core/league/<entity>/`. Preserve the `round` query parameter and scope fixtures, results, standings, duties, decisions, and captain reviews consistently. Constitution/settings are season/account-wide. |
| Competition assets and schedule | `core/competition/registry.ts`, `competition.service.ts`. Add a registry definition for another competition. Outside this folder use the service, not catalogues or hard-coded URC labels/round counts. |
| League data transport | `core/league/data/` (`league-data.ts`, `http-league-data.ts`, `sample-league-data.ts`, `sample-leagues.ts`) and `league.models.ts`. Keep HTTP, sample, and empty providers consistent. `core/api/api-error.ts` owns `ApiError`. |
| League entities | `core/league/<entity>/` read and control services: `members`, `picks`, `standings`, `rules`, `duties`, `cases`, `polls`, `marks`, `notes`, `feed`, `join`, `notifications`. `league-records.service.ts` owns source, loading, error, and reload. Components inject these, never the data layer. |
| Scoring and rules | `core/league/superbru.ts` is the only Superbru calculator. Components read scores through `PickService` and `StandingService`. `shared/rules-fields` owns reusable fields and typed form helpers. |
| Match chat | `core/league/chat/` (`ChatService` reads the thread, counts and the streaming answer; `ChatControlService` loads, asks, stops and clears; `ChatStore` holds the state for both) and `features/match/match-chat`: `MatchChatLauncher` (the fixed button at the match page's bottom right, above the mobile navigation, deferred with the AI SDK; it reads the thread once per fixture and hides for `chat_off`; with a favourite team it and the sheet wear that club through `match-chat.club.ts`: a scarf stripe, the club accent, and the member's questions on the club's banner pattern) opens `MatchChatSheet` (a Helm/Brain dialog positioned as a bottom sheet up to 1050 px and a right-hand panel above; ready-question chips, thread, question field, remaining count). Only the control service touches the AI SDK `Chat` and `DefaultChatTransport`. `fetch` bypasses the auth interceptor, so the transport sets the bearer header per request from the current session, and the body is the new question alone. Agent text stays plain text. |
| Push notifications | `core/push` (`PushClient` transport and device state, `PushService` reads, `PushControlService` changes), `features/more/push-card`, `public/sw.js` and `public/manifest.webmanifest`. The worker shows messages and caches nothing. Sign-out turns push off for the device before the session ends. |
| Profile and uploads | `core/profile/profile.service.ts`, `profile-control.service.ts`, `profile-storage.ts`, `profile-photo.ts`, `features/profile`. Favourite team is per league. Photo is account-wide. Production uses the API and private Storage. |
| Management centre | `features/manage`, `core/league/admin/` (`AdminLeagueService`, `AdminLeagueControlService`, `admin-data.ts` transport). `create-league-form` and `league-card` own their forms. Reuse `time-zones.ts` groups with `shared/search-select`. Refresh account context after admin mutations. |
| Page sections | Home composes `next-actions`, `standings-summary`, and `feed`. Captain composes its cards, `evidence-review`, and `members-card`. Decisions composes its poll and `case-card`, which the captain's `evidence-review` reuses for its veto queue. Match owns loading/route reconciliation and passes data to weather, teamsheets, player-list, pool-picks-table, scoring, preview, and picks panels, and to the chat launcher, which opens the chat sheet. Preserve these boundaries. |
| Shell and navigation | `core/layout`. Route `PageData` needs a label, title/eyebrow, and parent for non-main pages. `Breadcrumbs` owns trail/history behavior. Main navigation links pass `navState`. |
| Controls and feedback | `shared/ui`, `shared/dropdown`, `core/feedback`. Reuse these instead of implementing another control or alert system. |
| API contracts | `core/api/generated.ts` is generated. Keep domain adaptations and older-response compatibility explicit in consuming models. Provider extras use explicit frontend contracts. |

## Behavior that must survive changes

- Routes live under `/:league`, except `/sign-in`, `/join/:code`, `/manage`, and `/no-league`. Use `leaguePath` or `LeagueContext.url/within` for links. Keep legacy redirects and query strings. Switching league clears previous records and updates competition/timezone. Sign-out clears context/data. API membership refusal redirects away from that league. The auth interceptor attaches tokens only to this API.
- `administers` means captain or global admin. `isCaptain` means captain only. An admin can view leagues without membership, but attributed actions must show `admin_not_a_member` refusals. Do not onboard that admin automatically.
- Development records are labelled sample data and persist in memory until reload. `?sampleAdmin=0` selects an ordinary member. Never describe browser-only profile changes as saved to a server. Unsupported backend features may have sample UI. Do not imply they are implemented remotely.
- Own picks lock at kickoff. Keep the pool hidden from everyone (the captain and the admin included) until kickoff; before it a member sees only their own pick. Preserve captain editing, missed/default picks, and recorded-total overrides. API house marks are authoritative and separate from Superbru points. `core/league/marks.ts` serves samples only.
- Preserve fixture source, season, and retrieval date. Unknown kickoffs remain unknown. Imports cannot invent results or substitute seasons. A reschedule must not silently move confirmed house deadlines.
- Times are UTC instants displayed through `LeagueTime` and the league's IANA zone. Use its `fromLocalInput` for `datetime-local`. Never hard-code SAST or a UTC offset.
- Render agent preview text as plain text. Keep notification read state per league, with a non-decreasing high-water mark and individual keys. Notifications refresh every ten minutes, or two during a live match.

## Controls, appearance, and accessibility

Preserve **Floodlights**: dark teal, chalk, restrained coral, Titillium Web, rugby artwork, jerseys, club colours, and stitched white actions. Assets live in `public/assets`. Shared styling is `src/styles/ui.scss` and `src/styles/spartan.scss`. Other styling stays component-scoped. Maintain contrast with every club palette and pair status colours with text.

- Local Spartan Helm components live in `shared/ui`, imported through `@spartan-ng/helm/*`. Generation settings are in `components.json`. Use button, input, textarea, label, checkbox, switch, radio-group, toggle, toggle-group, slider, dialog, and collapsible primitives as applicable. Preserve their Brain behavior and application styling.
- `shared/search-select` composes Spartan combobox/popover behavior for searchable member, round, and grouped timezone choices. Use this same component for short lists, including duty types and competitions. File, colour, and datetime inputs retain native pickers with Helm styling. Radio tiles retain artwork. Preserve specialized timeline, fixture navigation, and popover animations.
- Every control needs a visible label. Name icon-only buttons. Keep focus visible and restore it after dialogs close. Dialog content renders outside its page in an overlay, so use the shared dialog theme and query the overlay in tests. Verify keyboard operation, disabled states, form values, and validation on the actual inner control.
- Use `app-dropdown` for page sections. It preserves sticky headings, optional peek content, inert closed bodies, and reduced motion. Closing a pinned section must finish scrolling before folding its body. Keep `resetKey`/fragment behavior. Do not substitute immediate hiding. Dropdowns do not nest: a disclosure inside a section body (the preview's sources) is a Helm collapsible.
- Keep the floating mobile navigation fixed outside the shell grid, measured bottom padding including its safe-area gap, and `--sticky-offset` for headers. Do not introduce transforms/filters on ancestors of sticky/fixed elements. Hidden top-bar panels must stop affecting document height. Test page-end scrolling and 320 px overflow.
- Use trailing Lucide link icons: `lucideArrowRight` internally and `lucideExternalLink` externally, registered with `provideIcons` in `viewProviders`. Reuse `shared/icon` for existing artwork. No emoji or Unicode arrow/check glyphs. A white action reusing `::after` must remove its inherited stitched border.

## Errors and action feedback

Use `AlertService`, not inline error/success messages. `AlertSnack` is mounted once and keeps actionable cards accessible above dialogs.

- `warn`: validation, rejected files, or field-specific API refusals. `error`: failed network/save/upload/storage/clipboard operations. `success`: completed actions. `info`: nothing changed.
- One keyed card per form attempt. Show the first problem, at most two details, then the remaining count. Dismiss the key when resolved. Set `aria-invalid` and call `highlightProblem` on the first visible control/wrapper without moving focus.
- Keep empty/loading/error sections with retry actions for resources that failed to load. These are distinct from action notices.
- Identify test cards by text inside `role=status` or `role=alert`. Verify dialog cards and their actions remain clickable.

## Verification

Run from `apps/web`. Prefer Angular MCP for discovery, best practices, build/test, and dev-server lifecycle. Read current Angular documentation for uncertain APIs.

| Change/check | Command or action |
| --- | --- |
| Local review | `npm start` |
| Production compilation and budgets | `npm run build`. No new unused-import warnings. |
| Component/domain regression | `npm test -- --watch=false` |
| Browser journeys | `npm run test:e2e`. Set `PIELE_WEB_PORT` if another app owns 4200. |
| Production routing and CSP | Build first, then `npm run test:e2e:production`. |
| API contract changed | `npm run generate:api`, then review the generated diff and adaptations. |
| Contract drift | `npm run check:api` |

The API generator uses `../api/.venv` or `API_PYTHON`, without a running API/database. Its TypeScript 5 tooling stays in `scripts/api-types` because Angular uses TypeScript 6. Vitest workers are bounded in `vitest.config.ts`. JSDOM storage and ResizeObserver support live in `src/test-setup.ts`. Check actual geometry in Playwright.

Run relevant journeys for round scoping, profile persistence, uploads, keyboard/focus, and desktop/320 px layouts. Production CSP forbids inline scripts, so critical CSS inlining stays off. Do not add inline event handlers or new external origins other than HTTPS API calls. Report only checks actually run, distinguishing failures or skipped integration checks.
