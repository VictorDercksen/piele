# Match chat: floating launcher and chat sheet

Recorded on 2026-10-01 in Africa/Johannesburg time. Paths are relative to the repository root. Branch `claude/ecstatic-hypatia-1c7m9t`, continued from master after PR #84 merged.

## Request

The dropdown panel under the preview did not look or feel right. Mobbin references were inspected through the Mobbin MCP (MLS Sidekick's floating crest button and sheet, Comet's and Evernote's pinned ask bars, Vrbo's and Agoda's inline question cards, HoneyBook's and Linear's side panels, the NBA's Insights tab) and four directions were drawn on a Design canvas. The owner chose option A: a floating Pavilion button on the match page that opens a chat sheet. No API or agent change.

## Changes (`apps/web`)

- `features/match/match-chat/match-chat-launcher.{ts,html,scss,spec.ts}` (new): a fixed bottom-right 58 px teal button with the bot icon and an "Ask the Pavilion" pill (hidden under 400 px), above the mobile navigation using the shell's `--nav-height`, 24 px from the bottom on desktop. It reads the thread once per fixture and shows only when the API does not answer `chat_off`. It stays in the page flow as a spacer so the page end scrolls clear of it. Deferred on idle with the sheet, because its `chat_off` check needs the control service, which imports the AI SDK.
- `features/match/match-chat/match-chat-sheet.{ts,html,scss,spec.ts}` (new): the chat on Brain's dialog (CDK overlay on body: `role="dialog"`, `aria-modal`, focus trap, Escape and backdrop close, body scroll lock). Bottom sheet from 120 px down on viewports up to 1050 px, a 420 px right-hand panel above that. Header with the bot mark, "THE PAVILION" and the fixture; intro line; ready-question chips while the thread is empty ("Who is missing for {home}?", the same for the away side, the forecast, "Summarise the preview"); the thread with inline source links under each answer; a pill field with a round send button that becomes stop while streaming; the remaining line with a Clear action. Opening reloads the thread and focuses the field; a fixture change closes it; focus returns to the launcher.
- `features/match/match-chat/match-chat.{ts,html,scss,spec.ts}` deleted (the dropdown panel). `match-chat.messages.ts` gains `readyQuestions` and the intro text; `match-chat.form.ts` loses the Enter rule (a single-line input submits natively).
- `features/match/match.page.{html,ts}`: the launcher at the page's top level inside `@if (previewConfigured) { @defer (on idle) { … } }`; the grid no longer holds a chat panel.
- `styles/spartan.scss`: the chat sheet's backdrop is `#0b1518aa` without blur and fades on close.
- `CLAUDE.md`: the Match chat and Page sections rows name the launcher and sheet.

## Checks run (`apps/web`, Node 24 via `npx -y node@24`)

- `ng build`: complete, no warnings. Initial 697.72 kB raw; the AI SDK is only in the deferred launcher chunk (176.72 kB raw); the match-page chunk 136.28 kB.
- `ng test --watch=false`: 122 files, 612 tests passed.
- Prettier: the same 15 files as at HEAD, none new.
- Playwright `match-centre`, `live-scoring`, `superbru`: 14 passed (scratch config with `/opt/pw-browsers/chromium`, deleted afterwards).
- Static layout check in Chromium at 320, 390 and 1280 px with the built CSS: no ancestor of the launcher creates a containing block; the button keeps its place after scrolling; 16 px above the mobile nav and from the right edge; no horizontal overflow, including a long unbroken source title; close, send and clear at least 44 px; muted text on the panel 9.09:1.

## Unresolved / next steps

- The real components were not rendered in a browser against the API (the sample build has no Supabase config). Check on the phone once deployed: the slide, body scroll lock, iOS safe areas, and that the launcher clears the home indicator.
- The question field has a screen-reader-only label to match the approved placeholder-only design.
- Opening the sheet makes a second thread read after the launcher's; acceptable, but could share one.
