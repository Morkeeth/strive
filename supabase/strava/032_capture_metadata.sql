-- Recorded model/usage facts are additive, bounded and immutable after import.
begin;
alter table strava.runs add column if not exists capture_metadata jsonb;
create or replace function strava.guard_capture_metadata() returns trigger
language plpgsql security definer set search_path=strava,pg_temp as $$
declare m jsonb:=new.capture_metadata; k text;
begin
 if tg_op='UPDATE' and new.capture_metadata is distinct from old.capture_metadata then
  raise exception 'Recorded model and usage facts cannot be edited';
 end if;
 if m is null then return new; end if;
 if new.trace_basis in ('typed-by-author','historical-reconstruction') then raise exception 'Recorded usage needs a session capture'; end if;
 if jsonb_typeof(m) is distinct from 'object' or octet_length(m::text)>8192 then raise exception 'Invalid capture metadata'; end if;
 if exists(select 1 from jsonb_object_keys(m) x where x not in ('models','basis','input_tokens','output_tokens','cached_input_tokens','reasoning_tokens')) then raise exception 'Unsupported capture metadata'; end if;
 if m->>'basis' is null or m->>'basis' not in ('codex-records','claude-message-usage','cursor-model-info') then raise exception 'Unknown capture metadata source'; end if;
 if jsonb_typeof(m->'models') is distinct from 'array' then raise exception 'Invalid recorded models'; end if;
 if jsonb_array_length(m->'models')>32 or exists(select 1 from jsonb_array_elements(m->'models') x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 120 or (x#>>'{}') !~ '^[a-zA-Z0-9][a-zA-Z0-9 ._:/+\-]*$') then raise exception 'Invalid recorded models'; end if;
 foreach k in array array['input_tokens','output_tokens','cached_input_tokens','reasoning_tokens'] loop
  if m ? k and m->k<>'null'::jsonb and strava.grinder_is_safe_count(m->k) is not true then raise exception 'Invalid token count'; end if;
 end loop;
 if m->>'cached_input_tokens' is not null and (m->>'input_tokens' is null or (m->>'cached_input_tokens')::numeric>(m->>'input_tokens')::numeric) then raise exception 'Cached input exceeds input'; end if;
 if m->>'reasoning_tokens' is not null and (m->>'output_tokens' is null or (m->>'reasoning_tokens')::numeric>(m->>'output_tokens')::numeric) then raise exception 'Reasoning exceeds output'; end if;
 if (m->>'input_tokens')::numeric+(m->>'output_tokens')::numeric>9007199254740991 then raise exception 'Token count too large'; end if;
 return new;
end $$;
revoke all on function strava.guard_capture_metadata() from public,anon,authenticated;
create trigger runs_capture_metadata_guard before insert or update on strava.runs for each row execute function strava.guard_capture_metadata();
commit;
