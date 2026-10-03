-- Transactional private outbox. A failed ping never removes stored feedback.
begin;
create table if not exists strava.feedback_notifications (
 feedback_id uuid primary key references strava.alpha_feedback(id) on delete cascade,
 enqueued_at timestamptz not null default clock_timestamp(),
 next_attempt_at timestamptz not null default clock_timestamp(),
 attempts integer not null default 0,
 lease_token uuid,
 lease_until timestamptz,
 delivered_at timestamptz,
 last_error text check(last_error in ('delivery_failed'))
);
alter table strava.feedback_notifications enable row level security;
revoke all on strava.feedback_notifications from public,anon,authenticated;
create or replace function strava.enqueue_feedback_notification() returns trigger
language plpgsql security definer set search_path=strava,pg_temp as $$
begin
 insert into strava.feedback_notifications(feedback_id) values(new.id) on conflict do nothing;
 return new;
end $$;
revoke all on function strava.enqueue_feedback_notification() from public,anon,authenticated;
drop trigger if exists enqueue_feedback_notification on strava.alpha_feedback;
create trigger enqueue_feedback_notification after insert on strava.alpha_feedback
 for each row execute function strava.enqueue_feedback_notification();
-- Backfill existing private feedback once; reapply does not reset delivery state.
insert into strava.feedback_notifications(feedback_id)
 select id from strava.alpha_feedback on conflict do nothing;

create or replace function strava.feedback_notification_claim(p_limit integer default 10,p_profile_id uuid default null)
returns jsonb language plpgsql security definer set search_path=strava,pg_temp as $$
declare result jsonb;
begin
 with picked as (
  select q.feedback_id from strava.feedback_notifications q join strava.alpha_feedback f on f.id=q.feedback_id
  where q.delivered_at is null and q.next_attempt_at<=clock_timestamp()
   and (q.lease_until is null or q.lease_until<clock_timestamp())
   and (p_profile_id is null or f.profile_id=p_profile_id)
  order by q.enqueued_at limit least(greatest(coalesce(p_limit,10),1),10)
  for update of q skip locked
 ), claimed as (
  update strava.feedback_notifications q set attempts=q.attempts+1,lease_token=gen_random_uuid(),
   lease_until=clock_timestamp()+interval '5 minutes'
  from picked p where q.feedback_id=p.feedback_id returning q.feedback_id,q.lease_token
 ) select coalesce(jsonb_agg(jsonb_build_object('feedback_id',c.feedback_id,'lease_token',c.lease_token,
   'category',f.category,'created_at',f.created_at)),'[]'::jsonb) into result
 from claimed c join strava.alpha_feedback f on f.id=c.feedback_id;
 return result;
end $$;
revoke all on function strava.feedback_notification_claim(integer,uuid) from public,anon,authenticated;

create or replace function strava.feedback_notification_complete(p_feedback_id uuid,p_lease_token uuid,p_ok boolean)
returns boolean language plpgsql security definer set search_path=strava,pg_temp as $$
declare changed integer;
begin
 update strava.feedback_notifications set
  delivered_at=case when p_ok is true then clock_timestamp() else null end,
  next_attempt_at=case when p_ok is true then next_attempt_at else clock_timestamp()+interval '10 minutes' end,
  last_error=case when p_ok is true then null else 'delivery_failed' end,
  lease_token=null,lease_until=null
 where feedback_id=p_feedback_id and lease_token=p_lease_token and lease_until>clock_timestamp() and delivered_at is null;
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function strava.feedback_notification_complete(uuid,uuid,boolean) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant usage on schema strava to service_role;
  grant execute on function strava.feedback_notification_claim(integer,uuid) to service_role;
  grant execute on function strava.feedback_notification_complete(uuid,uuid,boolean) to service_role;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
