# Superbru jerseys

Recorded on 25 September 2026 in Africa/Johannesburg time.

## Request and completed work

Updated Edinburgh, Leinster, Lions and Ospreys to use Superbru jersey PNGs instead of the existing illustrated SVG placeholders. Downloaded the images unchanged from the public links on Superbru's 2026/27 URC tournament page:

- Edinburgh: `https://superbru-cdn.superbru.com/teams/images/generic/logo_large/257.png`
- Leinster: `https://superbru-cdn.superbru.com/teams/images/generic/logo_large/260.png`
- Lions: `https://superbru-cdn.superbru.com/teams/images/generic/logo_large/4.png`
- Ospreys: `https://superbru-cdn.superbru.com/teams/images/generic/logo_large/266.png`

Although Superbru names this directory `logo_large`, all four downloaded images were visually confirmed to be jersey illustrations. Each is a 200 x 150 transparent PNG. This change uses the artwork currently provided by Superbru and does not independently certify kit-season accuracy.

Added the four PNGs and `sources.json` under `apps/web/public/assets/images/jerseys`. Changed the four team declarations in `core/competition/teams.ts` to use PNGs through the existing asset resolver. Existing SVG files remain unused. Other jerseys and prior stadium changes were preserved.

## Verification

The running Angular development server rebuilt successfully. Browser checks decoded all four images in the live profile preview and the round-one fixture ribbon, confirmed their dimensions and verified the saved Ospreys profile badge. A profile screenshot is in `outputs/superbru-jerseys-profile.png`.

Development server remains at `http://localhost:4200/`. No commit or deployment was requested.
