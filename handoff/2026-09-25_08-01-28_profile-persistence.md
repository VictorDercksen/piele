# Profile persistence

Recorded on 2026-09-25 in Africa/Johannesburg time.

## Request

Save the chosen favourite team and profile photo once they are chosen, instead of keeping them only in the browser.

## Completed changes

1. **Schema.** `supabase/migrations/20260925090000_member_profiles.sql` adds `favourite_team_id`, `photo_path` and `photo_updated_at` to `piele.users`. The profile is account-wide. A check constraint keeps `photo_path` under `avatars/<user id>/`. The existing `users_self` RLS policy already limits each caller to their own row.
2. **API** (`apps/api`).
   - `GET /v1/me` (and the claim response) now includes `favouriteTeamId` and `photoUrl`, a 5-minute signed Storage URL. If Storage cannot sign it, `photoUrl` is null and the team still loads.
   - `POST /v1/me/photo/uploads` issues a signed upload grant for `avatars/<user id>/<uuid>-<token>.jpg` in the existing bucket. It accepts only `image/jpeg` up to `PROFILE_PHOTO_MAX_BYTES` (default 512 KB).
   - `PUT /v1/me/profile` takes `{favouriteTeamId, photoPath?, removePhoto?}`. It checks the team against the club catalogue. It accepts a photo only under the caller's own prefix, checks the stored size and the JPEG signature (the first bytes, not the uploader's type claim), deletes a rejected upload, deletes the replaced photo on best effort, and writes a `profile.updated` audit event. It changes only the caller's own row.
   - `storage.py` has two new methods: `read_prefix` (ranged GET on `/object/authenticated/...`) and `delete_object` (`DELETE /object/{bucket}` with `prefixes`). Neither REST shape has been checked against a live bucket.
3. **Web** (`apps/web`).
   - `ProfileStore` now reads the profile from `HttpLeagueData` when the build uses the API. It still uses localStorage in sample and empty builds. `save()` is now async. A browser-local profile from before this change pre-fills onboarding and is removed after the first save to the server.
   - `HttpLeagueData.saveProfile()` uploads a new photo straight to Storage with the grant, then calls `PUT /me/profile`. On load it downloads the signed photo, checks that it is a JPEG and keeps it as a data URL, so the CSP `img-src` did not need to change.
   - `profileRequired` and `profileMissing` are now async and wait for membership to load. Without that, returning members would be sent to `/welcome` before their saved team arrived.
   - The profile editor shows a saving state. Its footer says where the profile is saved: the league account, or only this browser.
4. Docs updated: `README.md`, `apps/api/README.md`, `docs/production.md` and both `CLAUDE.md` files.

## Checks run

- `uv run pytest` against local PostgreSQL 16 with all migrations applied, as `piele_api`: 50 passed. Two tests are new: saving and replacing the team and photo, and photo validation, ownership and Storage-down behaviour.
- `ng test --watch=false`: 46 passed. New specs: `HttpLeagueData` profile load, upload, keep and remove; profile guards waiting for the saved profile.
- `ng build`: passed with no warnings.
- `playwright test` (port 4300, preinstalled Chromium via a temporary config): 15 passed. This covers the sample build, which still stores the profile in the browser.
- Node 24.21.0 through nvm. Prettier was run on the new spec. `http-league-data.ts` was already not Prettier-clean before this change and was not reformatted.

## Open points

1. No run against a live Supabase project yet. After deploying to staging, sign in, choose a team and photo, then sign in on a second device.
2. Uploads that are granted but never saved leave orphan objects under `avatars/`. So do failed deletes of replaced photos. Both are private. Media retention (H7) should sweep them.
3. Other members' rows still show no favourite team, because `users` RLS is self-only. Showing it league-wide would need a membership-level column or a policy change.
