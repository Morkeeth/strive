-- REVIEW ONLY. Apply before the matching web deployment. No run visibility changes.
begin;
alter table strava.run_photos add column if not exists sort_position integer;
alter table strava.run_photos add column if not exists personal_public_selected boolean;
-- NULL marks rows not yet migrated: retrying never re-grants withdrawn consent.
update strava.run_photos set personal_public_selected=(role='personal' and is_cover)
 where personal_public_selected is null;
alter table strava.run_photos alter column personal_public_selected set default false;
alter table strava.run_photos alter column personal_public_selected set not null;
with positions as (
 select p.id,row_number() over(partition by p.run_id order by
 case when r.photo_layout='result' and r.capture_metadata->'estimates'->>'v'='1'
 then case when p.role='result' then 0 when p.role='personal' then 2 else 1 end
 else case when p.is_cover then 0 else 1 end end,p.created_at,p.id)-1 n
 from strava.run_photos p join strava.runs r on r.id=p.run_id
) update strava.run_photos p set sort_position=positions.n from positions
 where p.id=positions.id and p.sort_position is null;
alter table strava.run_photos alter column sort_position set default 100;
alter table strava.run_photos alter column sort_position set not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='strava.run_photos'::regclass and conname='run_photos_sort_position') then
  alter table strava.run_photos add constraint run_photos_sort_position check(sort_position between 0 and 100);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='strava.run_photos'::regclass and conname='run_photos_personal_consent') then
  alter table strava.run_photos add constraint run_photos_personal_consent check(not personal_public_selected or role='personal');
 end if;
end $$;
create unique index if not exists run_photos_one_public_personal on strava.run_photos(run_id) where personal_public_selected;

drop policy if exists run_photos_read on strava.run_photos;
create policy run_photos_read on strava.run_photos for select to anon,authenticated using (
 exists(select 1 from strava.runs r where r.id=run_id and r.profile_id=strava.grinder_profile_id())
 or (is_selected and (role<>'personal' or personal_public_selected) and strava.grinder_can_read_run(run_id))
);

create or replace function strava.set_run_personal_public(target_run uuid,target_photo uuid,selected boolean) returns uuid
language plpgsql security definer set search_path=strava,pg_temp as $$
begin
 if selected is null then raise exception 'Choose whether to share this personal photo'; end if;
 perform 1 from strava.runs where id=target_run and profile_id=strava.grinder_profile_id() for update;
 if not found then raise exception 'Run not found'; end if;
 perform 1 from strava.run_photos where id=target_photo and run_id=target_run and role='personal';
 if not found then raise exception 'Personal photo not found'; end if;
 if selected then update strava.run_photos set personal_public_selected=false where run_id=target_run and personal_public_selected; end if;
 update strava.run_photos set personal_public_selected=selected where id=target_photo and run_id=target_run;
 return target_photo;
end $$;

create or replace function strava.reorder_run_photos(target_run uuid,ordered_photos uuid[]) returns uuid
language plpgsql security definer set search_path=strava,pg_temp as $$
declare total integer;
begin
 perform 1 from strava.runs where id=target_run and profile_id=strava.grinder_profile_id() for update;
 if not found then raise exception 'Run not found'; end if;
 select count(*) into total from strava.run_photos where run_id=target_run;
 if ordered_photos is null or cardinality(ordered_photos)<>total or total>6
 or (select count(distinct id) from unnest(ordered_photos) id)<>total
 or exists(select 1 from unnest(ordered_photos) o(id) where not exists(select 1 from strava.run_photos p where p.id=o.id and p.run_id=target_run))
 then raise exception 'Order must include each saved image exactly once'; end if;
 update strava.run_photos set is_cover=false where run_id=target_run and is_cover;
 update strava.run_photos p set sort_position=o.n-1,is_cover=(o.n=1)
 from unnest(ordered_photos) with ordinality o(id,n) where p.id=o.id and p.run_id=target_run;
 return target_run;
end $$;
-- Old clients may choose a cover; this changes order, never personal consent.
create or replace function strava.choose_run_cover(target_run uuid,target_photo uuid) returns uuid
language plpgsql security definer set search_path=strava,pg_temp as $$
declare ordering uuid[];
begin
 perform 1 from strava.runs where id=target_run and profile_id=strava.grinder_profile_id() for update;
 if not found then raise exception 'Run not found'; end if;
 perform 1 from strava.run_photos where id=target_photo and run_id=target_run;
 if not found then raise exception 'Photo not found'; end if;
 select array_agg(id order by (id=target_photo) desc,sort_position,created_at,id) into ordering from strava.run_photos where run_id=target_run;
 perform strava.reorder_run_photos(target_run,ordering);
 return target_photo;
end $$;
create or replace function strava.set_run_photo_role(target_run uuid,target_photo uuid,chosen_role text) returns uuid
language plpgsql security definer set search_path=strava,pg_temp as $$
begin
 if chosen_role is null or chosen_role not in ('photo','result','before','after','personal') then raise exception 'Choose a valid image role'; end if;
 perform 1 from strava.runs where id=target_run and profile_id=strava.grinder_profile_id() for update;
 if not found then raise exception 'Run not found'; end if;
 update strava.run_photos set role=chosen_role,personal_public_selected=case when chosen_role='personal' then personal_public_selected else false end where id=target_photo and run_id=target_run;
 if not found then raise exception 'Photo not found'; end if;
 return target_photo;
end $$;
revoke all on function strava.set_run_personal_public(uuid,uuid,boolean),strava.reorder_run_photos(uuid,uuid[]) from public,anon;
grant execute on function strava.set_run_personal_public(uuid,uuid,boolean),strava.reorder_run_photos(uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
