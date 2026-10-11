-- REVIEW ONLY. Restore the pre-039 contract after the old web build is restored.
-- Preserve private/removed rows by withdrawing their selection before dropping is_private.
begin;
update strava.run_photos set is_selected=false where is_private;
drop policy if exists run_photos_read on strava.run_photos;
create policy run_photos_read on strava.run_photos for select to anon,authenticated using (
 exists(select 1 from strava.runs r where r.id=run_id and r.profile_id=strava.grinder_profile_id())
 or (is_selected and (role<>'personal' or personal_public_selected) and strava.grinder_can_read_run(run_id))
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
create or replace function strava.read_day_card(owner_id uuid,card_key text,viewer_timezone text default 'UTC') returns jsonb
language plpgsql security definer set search_path=strava,pg_temp as $$
declare c jsonb; result jsonb; allowed text[]; field text; entry record; visuals jsonb:='{}'; photo jsonb; in_scope uuid[]; day_from date; day_through date;
begin
 select d.choices into c from strava.day_card_choices d where d.profile_id=owner_id and d.card_key=read_day_card.card_key;
 if c is null then return null; end if;
 if owner_id=strava.grinder_profile_id() then return c; end if;
 -- Match day.js: a session belongs to its start day, not every day its duration overlaps.
 -- Historical reconstruction belongs to repo_window_end minus one millisecond.
 if not exists(select 1 from pg_timezone_names where name=viewer_timezone) then raise exception 'Unknown time zone'; end if;
 day_from:=split_part(card_key,'_',1)::date;day_through:=split_part(card_key,'_',2)::date;
 if day_through<day_from or day_through>day_from+6 then return null; end if;
 select array_agg(r.id) into in_scope from strava.runs r
 where r.profile_id=owner_id and r.visibility='public' and strava.grinder_can_read_run(r.id)
 and ((case when r.trace_basis='historical-reconstruction' and r.history_evidence->>'repo_window_end' is not null
   then (r.history_evidence->>'repo_window_end')::timestamptz-interval '1 millisecond'
   else coalesce(r.started_at,r.created_at) end) at time zone viewer_timezone)::date between day_from and day_through;
 in_scope:=coalesce(in_scope,array[]::uuid[]);
 -- Only already-public project names determine the reader's allowed tokens. Private names are never returned.
 select array_agg(distinct substr(encode(sha256(convert_to(owner_id::text||'|'||card_key||'|'||r.project,'UTF8')),'hex'),1,12))
 into allowed from strava.runs r where r.profile_id=owner_id and r.id=any(in_scope) and r.project is not null;
 allowed:=coalesce(allowed,array[]::text[]);
 if cardinality(allowed)=0 then return null; end if;
 -- The free-form headline remains private. A partial public card uses its measured default headline.
 result:=jsonb_build_object('v',2,'highlights',case when jsonb_typeof(c->'highlights')='boolean' then c->'highlights' else 'true'::jsonb end,'visual','data','hero',false);
 foreach field in array array['order','hidden'] loop
  select coalesce(jsonb_agg(v),'[]') into photo from jsonb_array_elements_text(case when jsonb_typeof(c->field)='array' then c->field else '[]' end) v where v=any(allowed);
  result:=result||jsonb_build_object(field,photo);
 end loop;
 if c->>'lead'=any(allowed) then result:=result||jsonb_build_object('lead',c->'lead'); end if;
 -- Public photos must belong to an already-public run of this author. RLS checks at image read still apply.
 if exists(select 1 from strava.run_photos p join strava.runs r on r.id=p.run_id where r.profile_id=owner_id and r.id=any(in_scope) and r.id::text=c->'photo'->>'run' and p.id::text=c->'photo'->>'id') then
  result:=result||jsonb_build_object('photo',jsonb_build_object('run',c->'photo'->>'run','id',c->'photo'->>'id'),'visual',case when c->>'visual' in ('photo','screenshot') then c->>'visual' else 'data' end,'hero',c->>'hero'='true','focus',case when c->>'focus' in ('top','bottom','left','right') then c->>'focus' else 'center' end);
 end if;
 for entry in select key,value from jsonb_each(case when jsonb_typeof(c->'projectVisuals')='object' then c->'projectVisuals' else '{}' end) loop
  if not(entry.key=any(allowed)) then continue; end if;
  if entry.value->>'visual'='data' then visuals:=visuals||jsonb_build_object(entry.key,jsonb_build_object('visual','data'));
  elsif exists(select 1 from strava.run_photos p join strava.runs r on r.id=p.run_id where r.profile_id=owner_id and r.id=any(in_scope) and r.id::text=entry.value->'photo'->>'run' and p.id::text=entry.value->'photo'->>'id'
    and substr(encode(sha256(convert_to(owner_id::text||'|'||card_key||'|'||r.project,'UTF8')),'hex'),1,12)=entry.key) then
   visuals:=visuals||jsonb_build_object(entry.key,jsonb_build_object('photo',jsonb_build_object('run',entry.value->'photo'->>'run','id',entry.value->'photo'->>'id'),'visual',case when entry.value->>'visual' in ('photo','screenshot') then entry.value->>'visual' else 'data' end,'focus',case when entry.value->>'focus' in ('top','bottom','left','right') then entry.value->>'focus' else 'center' end));
  end if;
 end loop;
 -- Fact choices are identifiers, never arbitrary nested profile data.
 photo:='{}';
 foreach field in array array['whole','project'] loop
  select photo||jsonb_build_object(field,coalesce(jsonb_agg(v),'[]'::jsonb)) into photo from (select v from jsonb_array_elements_text(case when jsonb_typeof(c->'facts'->field)='array' then c->'facts'->field else '[]' end) v where v=any(array['projects','commits','elapsed','session','runs','tools','peak']) limit 3) bounded;
 end loop;
 return result||jsonb_build_object('projectVisuals',visuals,'facts',photo);
end $$;
drop trigger if exists run_photo_limit_selected on strava.run_photos;
create or replace function strava.run_photo_limit() returns trigger
language plpgsql security definer set search_path=strava,pg_temp as $$
begin
 perform 1 from strava.runs where id=new.run_id for update;
 if (select count(*) from strava.run_photos where run_id=new.run_id)>=6 then
  raise exception 'A run can have up to six photos. Remove one before adding another.';
 end if;
 return new;
end $$;
revoke all on function strava.run_photo_limit() from public,anon,authenticated;
drop function strava.set_run_photo_private(uuid,uuid,boolean);
drop function strava.repair_run_photo_cover(uuid);
drop function strava.run_photo_is_public(strava.run_photos);
alter table strava.run_photos drop column is_private;
notify pgrst,'reload schema';
commit;
