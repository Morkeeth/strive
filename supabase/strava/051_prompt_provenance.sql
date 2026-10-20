-- Bounded, immutable prompt-origin counts. Apply before deploying code that saves this field.
begin;
alter table strava.runs add column if not exists prompt_provenance jsonb;

create or replace function strava.check_prompt_provenance(p jsonb) returns void
language plpgsql set search_path=strava,pg_temp as $$
declare k text; n numeric; relay_total numeric := 0;
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
 for k,n in select key,(value#>>'{}')::numeric from jsonb_each(p->'relays') loop
  if length(k) not between 1 and 40 or n<1 or n>1000000 or trunc(n)<>n then raise exception 'Invalid relay count'; end if;
  relay_total := relay_total+n;
 end loop;
 if relay_total<>(p->'counts'->>'human-via-tool')::numeric then raise exception 'Relay total mismatch'; end if;
end $$;
revoke all on function strava.check_prompt_provenance(jsonb) from public,anon,authenticated;

create or replace function strava.guard_prompt_provenance() returns trigger
language plpgsql security definer set search_path=strava,pg_temp as $$
begin
 if tg_op='UPDATE' and new.prompt_provenance is distinct from old.prompt_provenance then raise exception 'Prompt provenance cannot be edited'; end if;
 perform strava.check_prompt_provenance(new.prompt_provenance);
 return new;
end $$;
revoke all on function strava.guard_prompt_provenance() from public,anon,authenticated;
create trigger runs_prompt_provenance_guard before insert or update on strava.runs for each row execute function strava.guard_prompt_provenance();
commit;
