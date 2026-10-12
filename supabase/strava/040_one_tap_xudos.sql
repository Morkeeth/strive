-- One-tap XUDOS keeps the older specific reasons readable and adds a neutral reaction.
begin;

alter table strava.acks drop constraint if exists acks_reason_check;
alter table strava.acks add constraint acks_reason_check check
  (reason = any (array['solved','checked','helped','explained','recovered','shipped',
                       'focus','pace','rig','comeback','handoff','appreciated']));

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
    if target is null or target = new.from_profile or target is distinct from new.to_profile then
      raise exception 'XUDOS needs another builder and their run';
    end if;
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

-- Delete of own XUDOS is already allowed by grinder_ack_delete. One row per builder per run.
create unique index if not exists acks_one_per_builder_run on strava.acks (from_profile, run_id);

commit;
