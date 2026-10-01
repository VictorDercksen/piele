# Match chat: closes at kickoff, launcher hidden when closed

Recorded on 2026-10-01 in Africa/Johannesburg time. Paths are relative to the repository root. Branch `claude/ecstatic-hypatia-1c7m9t`, continued from master after PR #86 merged.

## Request

The agent should not be available once picks have locked and the match has started. Rather than the sheet saying it is closed, hide the button.

## Changes

- `apps/api/app/chat/limits.py`: the window is now three days before kickoff until kickoff (exclusive), while the season is open; `CLOSES_AFTER_KICKOFF` is gone. The `chat_closed` message in `app/chat/service.py` and the comment in `app/routers/chat.py` say so. `README.md` (API and root) updated.
- `apps/api/tests/test_chat.py`: the window test covers the second before and the moment of kickoff; the closed-window test adds kickoff and two hours after; the limits test asks the evening fixture (`292607`, Leinster v Cardiff) after the clock passes kickoff, since the two afternoon fixtures are closed by then.
- `apps/web/src/app/features/match/match-chat/match-chat-launcher.ts`: once the thread is read the launcher shows only when the API reports `open`; a failed read still shows it so the sheet can explain. New spec: a closed chat keeps it hidden. The sheet's closed sentence (`match-chat.messages.ts`, for a sheet already open at kickoff or a fixture more than three days out) now reads "closes at kickoff"; the sheet spec updated.
- The context builder's match section (score and timeline once started) is now unreachable in practice and was left in place.

## Checks run

- API: `uv run pytest` with the local database: 264 passed, 2 skipped.
- Web (Node 24): `ng test --watch=false` 122 files, 613 tests passed; `ng build` complete with no warnings; Prettier clean on the changed folders.

## Unresolved / next steps

- A sheet open at the moment of kickoff shows the closed sentence; the launcher disappears on the next thread read (a fixture change or page load). A timer on kickoff could close it live if wanted.
