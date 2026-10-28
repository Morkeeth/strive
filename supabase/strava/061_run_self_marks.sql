-- "Proud of this": a private mark a person puts on their own run. Not applied. Root runs it.
-- Independent of 058. It is not a XUDOS: acks still refuse the same owner, and no count, board or
-- public view reads this table. Only the owner can see, add or remove a mark, and only on a run
-- they own. 060's export function reads it, so 061 must be applied before 060 is called.
begin;

create table if not exists strava.run_self_marks (
 profile_id uuid not null references strava.profiles(id) on delete cascade,
 run_id uuid not null references strava.runs(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 primary key(profile_id,run_id)
);

create or replace function strava.run_self_mark_guard() returns trigger
language plpgsql security definer set search_path=strava,pg_temp as $$
begin
 if new.profile_id is distinct from strava.grinder_profile_id()
  or not exists(select 1 from strava.runs where id=new.run_id and profile_id=new.profile_id) then
  raise exception 'You can only mark your own run.' using errcode='42501';
 end if;
 new.created_at:=clock_timestamp();
 return new;
end $$;
revoke all on function strava.run_self_mark_guard() from public,anon,authenticated;
drop trigger if exists run_self_mark_guard on strava.run_self_marks;
create trigger run_self_mark_guard before insert on strava.run_self_marks for each row execute function strava.run_self_mark_guard();

alter table strava.run_self_marks enable row level security;
revoke all on strava.run_self_marks from public,anon,authenticated;
grant select, delete on strava.run_self_marks to authenticated;
grant insert(profile_id,run_id) on strava.run_self_marks to authenticated;
drop policy if exists run_self_marks_owner on strava.run_self_marks;
create policy run_self_marks_owner on strava.run_self_marks for all to authenticated
 using(profile_id=strava.grinder_profile_id()) with check(profile_id=strava.grinder_profile_id());

commit;
