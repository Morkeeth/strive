-- 5 Nov: authors may give XUDOS to their own saved runs. Root applies separately.
-- Preserve giver identity/RLS, readable-run/recipient guards and the unique giver/run key.
begin;

create or replace function strava.grinder_interaction_guard()
returns trigger language plpgsql security definer set search_path = strava, pg_temp as $$
declare actor uuid; target uuid;
begin
  if tg_table_name = 'grinder_replies' then
    actor := new.author_id;
    select r.profile_id into target from strava.runs r where r.id = new.run_id;
  elsif tg_table_name = 'acks' then
    actor := new.from_profile;
    select r.profile_id into target from strava.runs r where r.id = new.run_id;
    if target is null or target is distinct from new.to_profile then
      raise exception 'XUDOS must name the run’s actual author';
    end if;
    -- Derive this attribution from actual ownership, never a client assertion.
    new.same_owner := (target = new.from_profile);
    if new.reason is null or new.reason <> all(array['solved','checked','helped','explained','recovered','shipped',
                                                  'focus','pace','rig','comeback','handoff','appreciated']) then
      raise exception 'Choose a supported XUDOS reason';
    end if;
    if not strava.grinder_can_read_run(new.run_id) then raise exception 'Run unavailable'; end if;
  else
    actor := new.follower_id;
    target := new.followed_id;
  end if;
  if strava.grinder_blocked_pair(actor, target) then raise exception 'This interaction is unavailable'; end if;
  return new;
end $$;
revoke all on function strava.grinder_interaction_guard() from public, anon, authenticated;

-- A self reaction is visible on the run but is not a response from another person.
create or replace function strava.grinder_notify_ack() returns trigger
language plpgsql security definer set search_path=strava,pg_temp as $$
begin
  if new.to_profile = new.from_profile then return new; end if;
  insert into strava.grinder_notifications(recipient_id,actor_id,kind,run_id,source_id)
    values(new.to_profile,new.from_profile,'ack',new.run_id,new.id) on conflict do nothing;
  return new;
end $$;

notify pgrst, 'reload schema';
commit;
