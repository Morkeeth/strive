begin;
alter table strava.runs add column if not exists photo_layout text not null default 'cover' check (photo_layout in ('cover','result','before_after'));
alter table strava.run_photos add column if not exists role text not null default 'photo'
 check (role in ('photo','result','before','after','personal'));
create unique index if not exists run_photos_comparison_slot on strava.run_photos(run_id,role) where role in ('before','after');
create or replace function strava.set_run_photo_role(target_run uuid,target_photo uuid,chosen_role text) returns uuid
language plpgsql security definer set search_path=strava,pg_temp as $$
begin
 if chosen_role is null or chosen_role not in ('photo','result','before','after','personal') then raise exception 'Choose a valid image role'; end if;
 perform 1 from strava.runs where id=target_run and profile_id=strava.grinder_profile_id() for update;
 if not found then raise exception 'Run not found'; end if;
 update strava.run_photos set role=chosen_role where id=target_photo and run_id=target_run;
 if not found then raise exception 'Photo not found'; end if;
 return target_photo;
end $$;
revoke all on function strava.set_run_photo_role(uuid,uuid,text) from public,anon;
grant execute on function strava.set_run_photo_role(uuid,uuid,text) to authenticated;
commit;
