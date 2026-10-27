-- Apply on the live ec6a68f baseline (051 present). No 052/053/056 dependency.
-- The queue total and the new-run alert are separate facts.
-- First read establishes a baseline for old imports; it never hides or publishes a run.
begin;

create table if not exists strava.review_alert_cursors (
  profile_id uuid primary key references strava.profiles(id) on delete cascade,
  seen_created_at timestamptz,
  seen_id uuid,
  updated_at timestamptz not null default now(),
  constraint review_alert_cursor_pair check ((seen_created_at is null) = (seen_id is null))
);
alter table strava.review_alert_cursors enable row level security;
revoke all on strava.review_alert_cursors from public, anon, authenticated;

create or replace function strava.review_alert_counts() returns jsonb
language plpgsql security definer set search_path=strava,pg_temp as $$
declare owner uuid:=strava.grinder_profile_id(); latest_at timestamptz; latest_id uuid;
        cursor_at timestamptz; cursor_id uuid; pending bigint; unseen bigint;
begin
  if owner is null then raise exception 'Sign in to read your run alerts'; end if;
  select r.created_at,r.id into latest_at,latest_id from strava.runs r
   where r.profile_id=owner and r.visibility='private'
     and r.created_at>='2026-10-13T16:00:00Z'::timestamptz
   order by r.created_at desc,r.id desc limit 1;
  insert into strava.review_alert_cursors(profile_id,seen_created_at,seen_id)
    values(owner,latest_at,latest_id) on conflict (profile_id) do nothing;
  select c.seen_created_at,c.seen_id into cursor_at,cursor_id
    from strava.review_alert_cursors c where c.profile_id=owner;
  select count(*),count(*) filter(where cursor_at is null or
    (r.created_at,r.id)>(cursor_at,cursor_id)) into pending,unseen
    from strava.runs r where r.profile_id=owner and r.visibility='private'
      and r.created_at>='2026-10-13T16:00:00Z'::timestamptz;
  return jsonb_build_object('new_count',unseen,'pending_count',pending);
end $$;
revoke all on function strava.review_alert_counts() from public,anon;
grant execute on function strava.review_alert_counts() to authenticated;

create or replace function strava.mark_review_alerts_seen(through_created_at timestamptz,through_id uuid)
returns boolean language plpgsql security definer set search_path=strava,pg_temp as $$
declare owner uuid:=strava.grinder_profile_id();
begin
  if owner is null then raise exception 'Sign in to review your runs'; end if;
  if through_created_at is null or through_id is null or not exists (
    select 1 from strava.runs r where r.id=through_id and r.created_at=through_created_at
      and r.profile_id=owner and r.visibility='private'
      and r.created_at>='2026-10-13T16:00:00Z'::timestamptz
  ) then raise exception 'This review cursor is not an owned waiting run'; end if;
  insert into strava.review_alert_cursors(profile_id,seen_created_at,seen_id)
    values(owner,through_created_at,through_id)
  on conflict(profile_id) do update set
    seen_created_at=excluded.seen_created_at,seen_id=excluded.seen_id,updated_at=now()
  where strava.review_alert_cursors.seen_created_at is null or
    (strava.review_alert_cursors.seen_created_at,strava.review_alert_cursors.seen_id)
      <(excluded.seen_created_at,excluded.seen_id);
  return true;
end $$;
revoke all on function strava.mark_review_alerts_seen(timestamptz,uuid) from public,anon;
grant execute on function strava.mark_review_alerts_seen(timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
