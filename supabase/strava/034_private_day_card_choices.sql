begin;
create table strava.day_card_choices (
 profile_id uuid not null references strava.profiles(id) on delete cascade,
 card_key text not null check(card_key ~ '^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$'),
 choices jsonb not null check(jsonb_typeof(choices)='object' and octet_length(choices::text)<=32768),
 primary key(profile_id,card_key)
);
alter table strava.day_card_choices enable row level security;
create policy day_card_owner on strava.day_card_choices for all to authenticated
 using(profile_id=strava.grinder_profile_id()) with check(profile_id=strava.grinder_profile_id());
revoke all on strava.day_card_choices from public,anon;
grant select,insert,update,delete on strava.day_card_choices to authenticated;
insert into strava.day_card_choices(profile_id,card_key,choices)
 select p.id,c.key,c.value from strava.profiles p,
 lateral jsonb_each(case when jsonb_typeof(p.rig->'day_cards')='object' then p.rig->'day_cards' else '{}'::jsonb end) c
;
update strava.profiles set rig=rig-'day_cards' where rig ? 'day_cards';
create function strava.reject_public_day_choices() returns trigger language plpgsql set search_path=strava,pg_temp as $$
begin
 if new.rig ? 'day_cards' then raise exception 'Reload STRIVE before saving card choices. Card choices are stored privately.'; end if;
 return new;
end $$;
create trigger private_day_choices before insert or update of rig on strava.profiles for each row execute function strava.reject_public_day_choices();
create function strava.save_day_card(card_key text, choices jsonb) returns jsonb
language plpgsql security invoker set search_path=strava,pg_temp as $$
begin
 insert into strava.day_card_choices(profile_id,card_key,choices) values(strava.grinder_profile_id(),save_day_card.card_key,save_day_card.choices)
 on conflict on constraint day_card_choices_pkey do update set choices=excluded.choices;
 return choices;
end $$;
revoke all on function strava.save_day_card(text,jsonb) from public,anon;
grant execute on function strava.save_day_card(text,jsonb) to authenticated;
create function strava.read_day_card(owner_id uuid,card_key text,viewer_timezone text default 'UTC') returns jsonb
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
revoke all on function strava.read_day_card(uuid,text,text) from public;
grant execute on function strava.read_day_card(uuid,text,text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
