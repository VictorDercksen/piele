-- Own profile (plan M1 and "update own profile"): the favourite team and profile photo are
-- account-wide, so they live on the user row. favourite_team_id is validated by the API
-- against the competition catalogue. photo_path points at a private Storage object under
-- avatars/<user id>/ that only the API signs; the bytes never pass through the API.
alter table piele.users
  add column favourite_team_id varchar(40),
  add column photo_path varchar(300),
  add column photo_updated_at timestamptz,
  add constraint users_photo_path_own check (photo_path is null or photo_path like 'avatars/' || id::text || '/%');
