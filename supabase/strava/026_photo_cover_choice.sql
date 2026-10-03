begin;
alter table strava.run_photos add column if not exists is_cover boolean not null default false;
create unique index if not exists run_photos_one_cover on strava.run_photos(run_id) where is_cover;
create or replace function strava.choose_run_cover(target_run uuid,target_photo uuid) returns uuid
language plpgsql security definer set search_path=strava,pg_temp as $$
begin
 perform 1 from strava.runs where id=target_run and profile_id=strava.grinder_profile_id() for update;
 if not found then raise exception 'Run not found'; end if;
 perform 1 from strava.run_photos where id=target_photo and run_id=target_run;
 if not found then raise exception 'Photo not found'; end if;
 update strava.run_photos set is_cover=false where run_id=target_run and is_cover;
 update strava.run_photos set is_cover=true where id=target_photo and run_id=target_run;
 return target_photo;
end $$;
revoke all on function strava.choose_run_cover(uuid,uuid) from public,anon;
grant execute on function strava.choose_run_cover(uuid,uuid) to authenticated;
commit;
