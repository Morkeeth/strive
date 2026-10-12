-- Profiles stay public; the Supabase Auth user id behind each one does not. Auth is shared with
-- another app on this project, and anyone could list every profile's auth_uid.
-- Rollback: GRANT SELECT ON strava.profiles TO anon, authenticated; restore the three policies
-- from base.sql; DROP FUNCTION strava.my_profile(); restore strava_profile_by_handle from identity.sql.
begin;

-- These three policies looked up profiles.auth_uid in a subquery, which needs column access once
-- it is revoked. grinder_profile_id() answers the same question as definer and is already
-- granted to anon and authenticated (2026-09-05-permissions.sql).
alter policy runs_read on strava.runs using
  (visibility = any (array['public', 'link', 'anonymous']) or profile_id = (select strava.grinder_profile_id()));
alter policy runs_owner_write on strava.runs
  using (profile_id = (select strava.grinder_profile_id()))
  with check (profile_id = (select strava.grinder_profile_id()));
alter policy acks_write on strava.acks with check (from_profile = (select strava.grinder_profile_id()));

-- Every other profile column stays readable. A column added later needs its own grant;
-- scripts/test-private-auth-uid.mjs fails when one is missing.
revoke select on strava.profiles from anon, authenticated;
do $$
declare readable text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into readable
  from information_schema.columns
  where table_schema = 'strava' and table_name = 'profiles' and column_name <> 'auth_uid';
  execute format('grant select (%s) on strava.profiles to anon, authenticated', readable);
end $$;

-- The owner's own row, auth_uid included.
create or replace function strava.my_profile() returns setof strava.profiles
language sql stable security definer set search_path = strava, pg_temp as $$
  select * from strava.profiles where auth_uid = auth.uid() limit 1
$$;
revoke all on function strava.my_profile() from public, anon;
grant execute on function strava.my_profile() to authenticated;

-- The public /?u= lookup keeps its row shape, with auth_uid empty.
create or replace function strava.strava_profile_by_handle(lookup text)
returns setof strava.profiles
language sql stable security definer set search_path = strava, pg_temp as $$
  select (jsonb_populate_record(null::strava.profiles, to_jsonb(found) - 'auth_uid')).*
  from (
    select * from strava.profiles where handle = lower(trim(lookup))
    union all
    select * from strava.profiles p
    where lower(p.github_handle) = lower(trim(lookup))
      and not exists (select 1 from strava.profiles q where q.handle = lower(trim(lookup)))
    limit 1
  ) found
$$;
revoke all on function strava.strava_profile_by_handle(text) from public;
grant execute on function strava.strava_profile_by_handle(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
