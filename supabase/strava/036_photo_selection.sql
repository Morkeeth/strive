-- Saved images may be kept privately without deleting their metadata or bytes.
begin;
alter table strava.run_photos add column if not exists is_selected boolean not null default true;

-- A reader must pass both the run audience and the author's image selection.
-- Owners keep access to every image, including hidden project images and unchosen personal photos.
drop policy if exists run_photos_read on strava.run_photos;
create policy run_photos_read on strava.run_photos for select to anon,authenticated
 using (
  exists(select 1 from strava.runs r where r.id=run_id and r.profile_id=strava.grinder_profile_id())
  or (is_selected and (role<>'personal' or is_cover) and strava.grinder_can_read_run(run_id))
 );

create or replace function strava.set_run_photo_selected(target_run uuid,target_photo uuid,selected boolean) returns uuid
language plpgsql security definer set search_path=strava,pg_temp as $$
begin
 if selected is null then raise exception 'Choose whether to show this image'; end if;
 perform 1 from strava.runs where id=target_run and profile_id=strava.grinder_profile_id() for update;
 if not found then raise exception 'Run not found'; end if;
 update strava.run_photos set is_selected=selected where id=target_photo and run_id=target_run;
 if not found then raise exception 'Photo not found'; end if;
 return target_photo;
end $$;
revoke all on function strava.set_run_photo_selected(uuid,uuid,boolean) from public,anon;
grant execute on function strava.set_run_photo_selected(uuid,uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
