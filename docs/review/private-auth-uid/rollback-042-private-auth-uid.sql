-- Complete rollback for supabase/strava/042_private_auth_uid.sql.
-- It restores the three policies, the profile grants and the handle lookup to the definitions on
-- main before 042 (commit 210c182), and removes strava.my_profile().
-- After it runs, anon and authenticated can read profiles.auth_uid again, as before 042.
-- Do not restore the lookup from supabase/strava/identity.sql: that file carries the 042 version.
-- scripts/test-private-auth-uid-rollback.mjs runs this file on the disposable database and
-- compares the result with tests/fixtures/pre-042-catalog.json. It is safe to run twice.
begin;

-- 1. Readers get the whole table again. The column grants from 042 are then removed, so the
--    table grant is the only rule, as before.
grant select on strava.profiles to anon, authenticated;
do $$
declare granted text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into granted
  from pg_attribute
  where attrelid = 'strava.profiles'::regclass and attnum > 0 and not attisdropped
    and attacl is not null;
  if granted is not null then
    execute format('revoke select (%s) on strava.profiles from anon, authenticated', granted);
  end if;
end $$;

-- 2. The three policies read profiles.auth_uid in a subquery again.
alter policy runs_read on strava.runs using (
  (visibility = any (array['public'::text, 'link'::text, 'anonymous'::text]))
  or (profile_id in (select profiles.id from strava.profiles
                     where profiles.auth_uid = auth.uid())));
alter policy runs_owner_write on strava.runs
  using (profile_id in (select profiles.id from strava.profiles
                        where profiles.auth_uid = auth.uid()))
  with check (profile_id in (select profiles.id from strava.profiles
                             where profiles.auth_uid = auth.uid()));
alter policy acks_write on strava.acks
  with check (from_profile in (select profiles.id from strava.profiles
                               where profiles.auth_uid = auth.uid()));

-- 3. The handle lookup runs as the caller again and returns the full row.
create or replace function strava.strava_profile_by_handle(lookup text)
returns setof strava.profiles
language sql stable security invoker set search_path = strava, pg_temp as $$
  select * from strava.profiles where handle = lower(trim(lookup))
  union all
  select * from strava.profiles p
  where lower(p.github_handle) = lower(trim(lookup))
    and not exists (select 1 from strava.profiles q where q.handle = lower(trim(lookup)))
  limit 1
$$;
revoke all on function strava.strava_profile_by_handle(text) from public;
grant execute on function strava.strava_profile_by_handle(text) to anon, authenticated;

-- 4. The owner read added by 042. The site falls back to the old owner read when it is missing.
drop function if exists strava.my_profile();

notify pgrst, 'reload schema';
commit;
