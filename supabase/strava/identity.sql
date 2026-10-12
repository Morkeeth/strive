-- Strava identity columns: a chosen handle, display name and avatar that belong to the
-- Strava profile, not to any sign-in provider. Applied only inside the strava schema.
-- Retry-safe. Every target is qualified with strava; nothing touches Grinder.
--
begin;
lock table strava.profiles in access exclusive mode;

-- github_handle keeps its legacy meaning (set only from a real GitHub identity) and its
-- unique key. Public lookups resolve the chosen handle first, then the legacy github_handle,
-- and a private unique-key claim table arbitrates both columns across concurrent writes.
-- A collision during backfill aborts the migration without choosing a new URL owner.

alter table strava.profiles
  add column if not exists handle text,
  add column if not exists display_name text,
  add column if not exists avatar_url text;

alter table strava.profiles
  drop constraint if exists profiles_handle_format,
  add constraint profiles_handle_format
    check (handle is null or handle ~ '^[a-z0-9]([a-z0-9_-]{0,38}[a-z0-9])?$'),
  drop constraint if exists profiles_display_name_length,
  add constraint profiles_display_name_length
    check (display_name is null or length(trim(display_name)) between 1 and 60),
  drop constraint if exists profiles_avatar_url_format,
  add constraint profiles_avatar_url_format
    check (avatar_url is null or (length(avatar_url) <= 2048 and avatar_url ~ '^https://[^[:space:]]+$'));

create unique index if not exists profiles_handle_unique on strava.profiles (handle) where handle is not null;

comment on column strava.profiles.handle is
  'Chosen public handle, lowercase; never inferred to prove ownership of any external account';
comment on column strava.profiles.display_name is 'Chosen display name; falls back to legacy name';
comment on column strava.profiles.avatar_url is 'https avatar chosen by the owner; may copy a provider avatar';

-- Every live URL label shares one case-insensitive namespace. Only trigger functions can
-- write this table; a unique index arbitrates concurrent transactions even when their
-- snapshots cannot see each other. This is deliberately not an application pre-check.
create table if not exists strava.profile_handle_claims (
  alias text primary key,
  profile_id uuid not null references strava.profiles(id) on delete cascade
);
alter table strava.profile_handle_claims enable row level security;
revoke all on strava.profile_handle_claims from public, anon, authenticated;

-- Backfill preserves IDs and both existing URLs. Existing ambiguous aliases fail closed.
insert into strava.profile_handle_claims(alias, profile_id)
select distinct lower(trim(label)), id
from strava.profiles p cross join lateral (values(p.handle),(p.github_handle)) labels(label)
where label is not null
on conflict (alias) do nothing;
do $$ begin
  if exists (
    select 1 from strava.profiles p
    cross join lateral (values(p.handle),(p.github_handle)) labels(label)
    join strava.profile_handle_claims c on c.alias=lower(trim(label))
    where label is not null and c.profile_id<>p.id
  ) then raise exception 'Existing profile aliases collide; resolve ownership before migrating'
    using errcode='unique_violation'; end if;
end $$;

create or replace function strava.strava_profile_handle_guard() returns trigger
language plpgsql security definer set search_path = strava, pg_temp as $$
begin
  if tg_op='UPDATE' and new.id is distinct from old.id then
    raise exception 'Profile IDs are permanent' using errcode='check_violation';
  end if;
  if new.handle is not null then
    new.handle := nullif(lower(trim(new.handle)), '');
  end if;
  if new.display_name is not null then
    new.display_name := nullif(trim(new.display_name), '');
  end if;
  -- Browser-supplied metadata is not proof of GitHub ownership. Check the server-owned
  -- Auth identity only on new/changed claims. Preserve existing legacy labels unchanged.
  if new.github_handle is not null and
      (tg_op='INSERT' or new.github_handle is distinct from old.github_handle) then
    if not exists (
      select 1 from auth.identities i
      where i.user_id=auth.uid() and i.user_id=new.auth_uid and i.provider='github'
        and lower(coalesce(nullif(i.identity_data->>'user_name',''),
                           nullif(i.identity_data->>'preferred_username',''),
                           nullif(i.identity_data->>'screen_name',''),
                           nullif(i.identity_data->>'username',''),
                           nullif(i.identity_data->>'login',''))) = lower(new.github_handle)
    ) then raise exception 'GitHub handle requires a linked GitHub identity'
      using errcode='insufficient_privilege'; end if;
  end if;
  return new;
end $$;
revoke all on function strava.strava_profile_handle_guard() from public, anon, authenticated;

drop trigger if exists strava_profile_handle_guard on strava.profiles;
create trigger strava_profile_handle_guard
  before insert or update of id, handle, github_handle, display_name on strava.profiles
  for each row execute function strava.strava_profile_handle_guard();

create or replace function strava.strava_profile_handle_claim() returns trigger
language plpgsql security definer set search_path = strava, pg_temp as $$
declare label text; claimed text;
begin
  delete from strava.profile_handle_claims c where c.profile_id=new.id
    and not exists(select 1 from unnest(array[new.handle,new.github_handle]) x
                   where lower(trim(x))=c.alias);
  for label in select distinct lower(trim(x)) from unnest(array[new.handle,new.github_handle]) x
               where x is not null order by 1 loop
    claimed := null;
    insert into strava.profile_handle_claims(alias,profile_id) values(label,new.id)
    on conflict (alias) do update set profile_id=excluded.profile_id
      where strava.profile_handle_claims.profile_id=excluded.profile_id
    returning alias into claimed;
    if claimed is null then raise exception 'handle_taken' using errcode='unique_violation'; end if;
  end loop;
  return new;
end $$;
revoke all on function strava.strava_profile_handle_claim() from public, anon, authenticated;
drop trigger if exists strava_profile_handle_claim on strava.profiles;
create trigger strava_profile_handle_claim
  after insert or update of handle, github_handle on strava.profiles
  for each row execute function strava.strava_profile_handle_claim();

-- Public lookup used by /?u=<handle>. Chosen handle wins; legacy github_handle is the fallback.
-- Readers cannot select auth_uid (041_private_auth_uid.sql), so the row comes back with it
-- empty. Kept identical to 041 because this script is re-run on installed schemas.
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

commit;
