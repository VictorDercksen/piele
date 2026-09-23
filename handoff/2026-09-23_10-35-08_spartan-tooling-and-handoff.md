# Spartan tooling and session handoffs

Recorded on 2026-09-23 in Africa/Johannesburg time. Paths below are relative to the workspace root, `C:\Users\victo\Desktop\piele-urc`.

## Request and completed work

The user selected Spartan for the Angular application and requested installation of its CLI and MCP. Installed `@spartan-ng/cli@1.5.0` and `@spartan-ng/mcp@1.5.0` as exact frontend development dependencies. Updated `piele/apps/web/package.json` and `package-lock.json`.

Registered `spartan-ui` in `.codex/config.toml` and the user's Codex configuration through `codex mcp add`. The server runs the locally installed package with Node. Its configured absolute path depends on this workspace location. The existing Supabase configuration was preserved. Restart Codex to load the new MCP tools into a session.

Updated the frontend `CLAUDE.md` to record Spartan as the selected library and distinguish installed tooling from runtime setup. Spartan runtime components, Tailwind and Angular CDK have not been initialized. No UI migration was performed.

The user then requested a `handoff/` folder and a mandatory handoff workflow. Created this workspace-root folder and updated both `piele/apps/web/CLAUDE.md` and `piele/apps/api/CLAUDE.md` to read the latest handoff before work and write a timestamped handoff before ending each session. Both existing `AGENTS.md` files already point to their respective `CLAUDE.md` files.

## Application context to preserve

Floodlights is the selected rugby design. Preserve the season timeline and round-scoped content on desktop and mobile, jersey matchups, favourite-team personalization and profile photo support. Profiles currently use browser-local storage. This is an interactive frontend prototype, with no implemented backend, authentication or database.

The frontend is in `piele/apps/web`, using Angular 22, standalone components, signals, zoneless change detection and SCSS. The API placeholder and its implementation guide are in `piele/apps/api`.

Fixture data is in `piele/apps/web/src/app/urc-fixtures.ts`, with import tooling in `piele/apps/web/scripts/import-urc.mjs`. The previous implementation imported the 2026/27 URC schedule. Preserve source metadata and unknown kickoff times. Do not invent results or present synthetic league data as published competition data.

The preceding UI change hid scrollbars while keeping scrolling enabled in the matchups ribbon and round selector. Relevant files are `piele/apps/web/src/app/match-hero.scss` and `piele/apps/web/src/app/season-timeline.scss`. Profile code is in `piele/apps/web/src/app/profile/`.

The authoritative planning documents are `piele-application-plan.md` and `piele-application-design.md`. The original visual reference is `Piele application designs.html`, and constitution assets are in `piele-urc-26-27-editable/`. User decisions take precedence over proposed plan defaults.

## Verification and remaining issues

During the Spartan installation, `npm ls @spartan-ng/cli @spartan-ng/mcp --depth=0` confirmed both packages at 1.5.0. `npx ng generate @spartan-ng/cli:ui --help` succeeded. An MCP SDK client connected to the local server and listed 17 tools. This checked initialization and tool discovery, not live documentation retrieval.

The Angular MCP production build for `piele-web` passed after installation. Unit and browser tests were not rerun for this tooling change. No application code changed for the handoff request, so build and application tests were not repeated for this documentation-only update.

`codex mcp get spartan-ui` succeeded when executed in the same escalated host environment used for registration, reporting the server enabled. The sandboxed invocation reported no matching server, so do not confuse sandbox configuration visibility with host registration failure.

`npm audit` reported seven high-severity transitive development dependency findings in the Spartan CLI's Nx chain, rooted in the `smol-toml` malformed-TOML denial-of-service advisory. `npm audit fix --dry-run --json` proposed no changes and left the findings unresolved. No forced upgrades or dependency overrides were applied.

## Next steps

The installation and handoff requests are complete. Follow the user's next task. If asked to integrate Spartan UI, consult its installation documentation and MCP, initialize the required runtime styling and components, and preserve the Floodlights design. Do not treat the tooling installation as a completed component migration.

Read the applicable `CLAUDE.md` before implementation. Prefer Angular MCP tools for builds and tests. Before ending the next session, add a new `YYYY-MM-DD_HH-mm-ss_<feature>.md` file here using Africa/Johannesburg time.
