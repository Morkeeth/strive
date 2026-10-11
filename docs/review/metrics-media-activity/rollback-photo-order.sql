-- REVIEW ONLY. Run as postgres before restoring the old application.
-- Preserve all rows, bytes, sort positions and consent values for recovery.
begin;
-- The old policy represents personal consent through is_cover. Copy current consent
-- into that compatibility field; never revive a previously withdrawn personal choice.
update strava.run_photos p set is_cover=false where p.is_cover and
 (p.role='personal' or exists(select 1 from strava.run_photos q where q.run_id=p.run_id and q.personal_public_selected));
update strava.run_photos set is_cover=true where role='personal' and personal_public_selected;
drop policy if exists run_photos_read on strava.run_photos;
create policy run_photos_read on strava.run_photos for select to anon,authenticated using (
 exists(select 1 from strava.runs r where r.id=run_id and r.profile_id=strava.grinder_profile_id())
 or (is_selected and (role<>'personal' or is_cover) and strava.grinder_can_read_run(run_id))
);
-- These pg_get_functiondef bytes match both live md5/length pairs in Fable’s 11 Oct readback.
CREATE OR REPLACE FUNCTION strava.choose_run_cover(target_run uuid, target_photo uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'strava', 'pg_temp'
AS $function$
begin
 perform 1 from strava.runs where id=target_run and profile_id=strava.grinder_profile_id() for update;
 if not found then raise exception 'Run not found'; end if;
 perform 1 from strava.run_photos where id=target_photo and run_id=target_run;
 if not found then raise exception 'Photo not found'; end if;
 update strava.run_photos set is_cover=false where run_id=target_run and is_cover;
 update strava.run_photos set is_cover=true where id=target_photo and run_id=target_run;
 return target_photo;
end $function$;

CREATE OR REPLACE FUNCTION strava.set_run_photo_role(target_run uuid, target_photo uuid, chosen_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'strava', 'pg_temp'
AS $function$
begin
 if chosen_role is null or chosen_role not in ('photo','result','before','after','personal') then raise exception 'Choose a valid image role'; end if;
 perform 1 from strava.runs where id=target_run and profile_id=strava.grinder_profile_id() for update;
 if not found then raise exception 'Run not found'; end if;
 update strava.run_photos set role=chosen_role where id=target_photo and run_id=target_run;
 if not found then raise exception 'Photo not found'; end if;
 return target_photo;
end $function$;

revoke all on function strava.reorder_run_photos(uuid,uuid[]),strava.set_run_personal_public(uuid,uuid,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
