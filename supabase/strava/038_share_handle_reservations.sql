-- Clean profile URLs must not shadow STRIVE's own routes. NOT VALID keeps any
-- historical collision readable while enforcing the rule on every new write.
begin;
lock table strava.profiles in access exclusive mode;
-- Rollback: DROP TRIGGER strava_share_alias_guard ON strava.profiles;
-- DROP FUNCTION strava.strava_share_alias_guard();
-- DROP INDEX strava.profiles_github_handle_ci_unique;
-- ALTER TABLE strava.profiles DROP CONSTRAINT profiles_handle_not_system_route;
alter table strava.profiles drop constraint if exists profiles_handle_not_system_route;
alter table strava.profiles
  add constraint profiles_handle_not_system_route
  check (handle is null or lower(handle) not in
    ('api','capture','about','privacy','terms','feed','people','add','r','l','d',
     'proof','agents','account','connect','favicon','robots','sitemap','login',
     'sign-in','post','projects','project','boards','inbox','following','mine','share'))
  not valid;

-- Refuse old aliases with two owners before installing the new rules. This covers
-- chosen-vs-GitHub and GitHub-vs-GitHub collisions, regardless of letter case.
do $$ begin
  if exists (
    select alias from (
      select lower(trim(p.handle)) alias,p.id from strava.profiles p where p.handle is not null
      union all
      select lower(trim(p.github_handle)) alias,p.id from strava.profiles p where p.github_handle is not null
    ) labels group by alias having count(distinct id)>1
  ) then raise exception 'Historical profile aliases collide; resolve ownership before migrating'
    using errcode='unique_violation'; end if;
end $$;

create unique index if not exists profiles_github_handle_ci_unique
  on strava.profiles (lower(github_handle)) where github_handle is not null;

-- identity.sql owns the claim trigger. Fill any missing claims while the profile
-- table is locked, then assert each alias points to its actual owner.
insert into strava.profile_handle_claims(alias,profile_id)
select distinct lower(trim(label)),p.id
from strava.profiles p cross join lateral (values(p.handle),(p.github_handle)) labels(label)
where label is not null
on conflict (alias) do nothing;
do $$ begin
  if exists (
    select 1 from strava.profiles p
    cross join lateral (values(p.handle),(p.github_handle)) labels(label)
    left join strava.profile_handle_claims c on c.alias=lower(trim(label))
    where label is not null and c.profile_id is distinct from p.id
  ) then raise exception 'Profile alias claims are incomplete or mismatched'
    using errcode='unique_violation'; end if;
end $$;

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
commit;
