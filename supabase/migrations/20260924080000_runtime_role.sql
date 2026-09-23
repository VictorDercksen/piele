-- Restricted runtime role for the Python API (plan section 4). It owns nothing, cannot
-- bypass row level security and reaches only the private piele schema. The role is created
-- without a password: an operator enables login once per project, outside migrations:
--   alter role piele_api with login password '<generated>';
-- The API then connects through the transaction pooler as piele_api.<project-ref>.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'piele_api') then
    create role piele_api nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end
$$;

grant usage on schema piele to piele_api;
grant select, insert, update, delete on all tables in schema piele to piele_api;

-- Tables and sequences created later by the migration role get the same grants.
alter default privileges in schema piele grant select, insert, update, delete on tables to piele_api;
alter default privileges in schema piele grant usage, select on sequences to piele_api;

-- The provider cache holds public feed data, not league records, so the runtime role may
-- read and write every row. League tables will get league-scoped policies instead.
create policy external_snapshots_runtime on piele.external_snapshots
  for all to piele_api using (true) with check (true);
