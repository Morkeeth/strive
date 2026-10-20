-- Bounded, immutable prompt-origin counts. Apply before deploying code that saves this field.
begin;
alter table strava.runs add column if not exists prompt_provenance jsonb;
alter table strava.dropin_links add column if not exists prompt_provenance jsonb;

create or replace function strava.check_prompt_provenance(p jsonb) returns void
language plpgsql set search_path=strava,pg_temp as $$
declare k text; relay_value jsonb; relay_total numeric := 0;
begin
 if p is null then return; end if;
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>2048 then raise exception 'Invalid prompt provenance'; end if;
 if exists(select 1 from jsonb_object_keys(p) x where x not in ('v','counts','human_turns','known_autonomous_turns','unknown_turns','relays')) then raise exception 'Unsupported prompt provenance field'; end if;
 if (select count(*) from jsonb_object_keys(p))<>6 then raise exception 'Missing prompt provenance field'; end if;
 if p->>'v' <> '1' or jsonb_typeof(p->'counts') is distinct from 'object' or jsonb_typeof(p->'relays') is distinct from 'object' then raise exception 'Invalid prompt provenance'; end if;
 if exists(select 1 from jsonb_object_keys(p->'counts') x where x not in ('human-typed','human-via-tool','agent-to-agent','automation','unknown')) then raise exception 'Unsupported prompt provenance kind'; end if;
 if (select count(*) from jsonb_object_keys(p->'counts'))<>5 then raise exception 'Missing prompt provenance kind'; end if;
 foreach k in array array['human-typed','human-via-tool','agent-to-agent','automation','unknown'] loop
  if not (p->'counts' ? k) or strava.grinder_is_safe_count(p->'counts'->k) is not true or (p->'counts'->>k)::numeric>1000000 then raise exception 'Invalid prompt provenance count'; end if;
 end loop;
 foreach k in array array['human_turns','known_autonomous_turns','unknown_turns'] loop
  if strava.grinder_is_safe_count(p->k) is not true or (p->>k)::numeric>1000000 then raise exception 'Invalid prompt provenance total'; end if;
 end loop;
 if (p->>'human_turns')::numeric <> (p->'counts'->>'human-typed')::numeric+(p->'counts'->>'human-via-tool')::numeric then raise exception 'Human provenance total mismatch'; end if;
 if (p->>'known_autonomous_turns')::numeric <> (p->'counts'->>'agent-to-agent')::numeric+(p->'counts'->>'automation')::numeric then raise exception 'Autonomous provenance total mismatch'; end if;
 if (p->>'unknown_turns')::numeric <> (p->'counts'->>'unknown')::numeric then raise exception 'Unknown provenance total mismatch'; end if;
 if (select count(*) from jsonb_object_keys(p->'relays'))>16 then raise exception 'Too many relay names'; end if;
 for k,relay_value in select key,value from jsonb_each(p->'relays') loop
  if length(k) not between 1 and 40 or strava.grinder_is_safe_count(relay_value) is not true then raise exception 'Invalid relay count'; end if;
  if (relay_value::text)::numeric>1000000 then raise exception 'Invalid relay count'; end if;
  relay_total := relay_total+(relay_value::text)::numeric;
 end loop;
 if relay_total<>(p->'counts'->>'human-via-tool')::numeric then raise exception 'Relay total mismatch'; end if;
end $$;
revoke all on function strava.check_prompt_provenance(jsonb) from public,anon,authenticated;

create or replace function strava.guard_prompt_provenance() returns trigger
language plpgsql security definer set search_path=strava,pg_temp as $$
declare carried text;
begin
 if tg_op='INSERT' and new.prompt_provenance is null then
  carried:=current_setting('strive.prompt_provenance',true);
  if carried is not null and carried not in ('','null') then new.prompt_provenance:=carried::jsonb; end if;
 end if;
 if tg_op='UPDATE' and new.prompt_provenance is distinct from old.prompt_provenance then raise exception 'Prompt provenance cannot be edited'; end if;
 perform strava.check_prompt_provenance(new.prompt_provenance);
 return new;
end $$;
revoke all on function strava.guard_prompt_provenance() from public,anon,authenticated;
drop trigger if exists runs_prompt_provenance_guard on strava.runs;
create trigger runs_prompt_provenance_guard before insert or update on strava.runs for each row execute function strava.guard_prompt_provenance();

-- Keep the existing agent validator intact behind a provenance-aware wrapper. Recompile the
-- action function after the rename so its call resolves to the wrapper, not the preserved OID.
do $$ begin
 if to_regprocedure('strava.grinder_check_agent_payload_without_prompt_provenance_051(jsonb)') is null then
  alter function strava.grinder_check_agent_payload(jsonb) rename to grinder_check_agent_payload_without_prompt_provenance_051;
 end if;
end $$;
create or replace function strava.grinder_check_agent_payload(payload jsonb) returns void
language plpgsql set search_path=strava,pg_temp as $$
begin
 perform strava.grinder_check_agent_payload_without_prompt_provenance_051(payload-'prompt_provenance');
 perform strava.check_prompt_provenance(nullif(payload->'prompt_provenance','null'::jsonb));
 perform set_config('strive.prompt_provenance',coalesce((payload->'prompt_provenance')::text,'null'),true);
end $$;
revoke all on function strava.grinder_check_agent_payload(jsonb) from public,anon,authenticated;
do $$ declare definition text; begin
 select pg_get_functiondef('strava.grinder_agent_action(text,text,jsonb,uuid)'::regprocedure) into definition;
 execute definition;
end $$;

-- Anonymous drop-in links are a separate persistence path. Wrap the existing bounded functions
-- so the same validated summary survives the link without widening any other accepted field.
do $$ begin
 if to_regprocedure('strava.dropin_create_without_prompt_provenance_051(jsonb,text)') is null then
  alter function strava.dropin_create(jsonb,text) rename to dropin_create_without_prompt_provenance_051;
  alter function strava.dropin_read(uuid) rename to dropin_read_without_prompt_provenance_051;
 end if;
end $$;
create or replace function strava.dropin_create(payload jsonb,bucket text) returns jsonb
language plpgsql volatile security definer set search_path=strava,pg_temp as $$
declare made jsonb; provenance jsonb:=nullif(payload->'prompt_provenance','null'::jsonb);
begin
 perform strava.check_prompt_provenance(provenance);
 made:=strava.dropin_create_without_prompt_provenance_051(payload-'prompt_provenance',bucket);
 update strava.dropin_links set prompt_provenance=provenance where id=(made->>'id')::uuid;
 return made;
end $$;
create or replace function strava.dropin_read(link_id uuid) returns jsonb
language plpgsql stable security definer set search_path=strava,pg_temp as $$
declare result jsonb; provenance jsonb;
begin
 result:=strava.dropin_read_without_prompt_provenance_051(link_id);
 if result is null then return null; end if;
 select prompt_provenance into provenance from strava.dropin_links where id=link_id and expires_at>now();
 return result||jsonb_build_object('prompt_provenance',provenance);
end $$;
revoke all on function strava.dropin_create(jsonb,text),strava.dropin_read(uuid) from public,anon,authenticated;
grant execute on function strava.dropin_create(jsonb,text),strava.dropin_read(uuid) to anon,authenticated;
commit;
