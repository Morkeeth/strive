-- Clean profile URLs must not shadow STRIVE's own routes. NOT VALID keeps any
-- historical collision readable while enforcing the rule on every new write.
-- Rollback: DROP TRIGGER strava_share_alias_guard ON strava.profiles;
-- DROP FUNCTION strava.strava_share_alias_guard();
-- ALTER TABLE strava.profiles DROP CONSTRAINT profiles_handle_not_system_route;
alter table strava.profiles
  add constraint profiles_handle_not_system_route
  check (handle is null or lower(handle) not in
    ('api','capture','about','privacy','terms','feed','people','add','r','l','d',
     'proof','agents','account','connect','favicon','robots','sitemap','login',
     'sign-in','post','projects','project','boards','inbox','following','mine','share'))
  not valid;

-- identity.sql already arbitrates both aliases in profile_handle_claims, including
-- concurrent writes. This explicit guard also rejects a pre-existing cross-column
-- collision in a database whose claim table was not fully backfilled.
create or replace function strava.strava_share_alias_guard() returns trigger
language plpgsql security definer set search_path = strava, pg_temp as $$
begin
  if exists (
    select 1 from strava.profiles p
    where p.id <> new.id and (
      (new.handle is not null and lower(p.github_handle)=lower(new.handle)) or
      (new.github_handle is not null and lower(p.handle)=lower(new.github_handle))
    )
  ) then raise exception 'handle_taken' using errcode='unique_violation'; end if;
  return new;
end $$;
revoke all on function strava.strava_share_alias_guard() from public, anon, authenticated;
drop trigger if exists strava_share_alias_guard on strava.profiles;
create trigger strava_share_alias_guard
  before insert or update of handle, github_handle on strava.profiles
  for each row execute function strava.strava_share_alias_guard();
