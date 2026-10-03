-- Historical source summaries are not measured sessions; all run metrics stay NULL.
begin;
alter table strava.runs add column if not exists history_evidence jsonb;
create or replace function strava.run_capture_guard() returns trigger
language plpgsql security definer set search_path = strava, pg_temp as $$
declare field text; trace jsonb;
begin
 if tg_op='INSERT' then
  if new.trace_basis='historical-reconstruction' then
   if new.schema_version is distinct from 1 or new.measurement_revision is null or new.measurement_revision !~ '^[a-f0-9]{64}$'
      or jsonb_typeof(new.history_evidence) is distinct from 'object' or octet_length(new.history_evidence::text)>2048 then
    raise exception 'Choose a source-indexed historical summary';
   end if;
   if (select count(*) from jsonb_object_keys(new.history_evidence))<>8 or exists(select 1 from jsonb_object_keys(new.history_evidence) k where k not in ('first_observed_at','last_observed_at','history_entries','repo_commits','repo_revision','source_ref','repo_window_start','repo_window_end')) then raise exception 'Unsupported historical evidence field'; end if;
   foreach field in array array['history_entries','repo_commits'] loop
    if strava.grinder_is_safe_count(new.history_evidence->field) is not true then raise exception 'Historical counts need source references'; end if;
   end loop;
   if new.history_evidence->>'repo_revision' is null or new.history_evidence->>'repo_revision' !~ '^[a-f0-9]{40}$' or new.history_evidence->>'source_ref' is null or new.history_evidence->>'source_ref' !~ '^[a-f0-9]{64}$' then raise exception 'Historical source reference missing'; end if;
   if new.history_evidence->>'first_observed_at' !~ '^\d{4}-\d{2}-\d{2}T' or new.history_evidence->>'last_observed_at' !~ '^\d{4}-\d{2}-\d{2}T' or new.history_evidence->>'first_observed_at' is null or new.history_evidence->>'last_observed_at' is null or (new.history_evidence->>'first_observed_at')::timestamptz>(new.history_evidence->>'last_observed_at')::timestamptz or (new.history_evidence->>'last_observed_at')::timestamptz>now() then raise exception 'Invalid historical source window'; end if;
   if new.history_evidence->>'repo_window_start' is null or new.history_evidence->>'repo_window_end' is null or new.history_evidence->>'repo_window_start' !~ '^\d{4}-\d{2}-\d{2}T' or new.history_evidence->>'repo_window_end' !~ '^\d{4}-\d{2}-\d{2}T' or (new.history_evidence->>'repo_window_start')::timestamptz >= (new.history_evidence->>'repo_window_end')::timestamptz or (new.history_evidence->>'repo_window_end')::timestamptz > now() then raise exception 'Invalid repository query window'; end if;
   foreach field in array array['started_at','harness','model','prompts','duration_s','wall_time_s','tool_calls','shell_calls','files_touched','commits','claims','claims_verified','artifacts_produced','rhythm','route','tool_mix','ridge','worker_bins','commit_bins','ridge_basis','ridge_wall_seconds','ridge_tool_calls','code_route','progress_delta'] loop
    if to_jsonb(new)->field <> 'null'::jsonb then raise exception 'Historical reconstruction cannot claim session metrics'; end if;
   end loop;
  else
   if new.history_evidence is not null then raise exception 'Historical summary needs its historical basis'; end if;
  if new.measurement_revision is null or new.measurement_revision !~ '^[a-f0-9]{64}$'
     or new.schema_version is distinct from 1 or lower(new.harness) not in ('claude code','claude-agent','cursor','codex','grok bot') or new.harness is null
     or new.trace_basis is null or new.trace_basis not in
       ('elapsed','position','typed-turn order','elapsed-agent-tool-calls','timestamped native events','timestamps unavailable','observed native events; timestamps unavailable',
        'typed-turn order; spacing is not elapsed time; sessions split on human-turn gaps, not measured idle',
        'typed-turn order; Grok Bot export has no top-level event timestamps')
     or (jsonb_typeof(new.rhythm) is distinct from 'array' and jsonb_typeof(new.ridge) is distinct from 'array') then
   raise exception 'Import a recorded session before saving a run. Manual runs are not supported.';
  end if;
  trace:=case when jsonb_typeof(new.rhythm)='array' and jsonb_array_length(new.rhythm)>0 then new.rhythm else new.ridge end;
  if jsonb_typeof(trace) is distinct from 'array' or jsonb_array_length(trace) not between 1 and 1000 then
   raise exception 'Import a recorded session with an activity trace.';
  end if;
  if exists(select 1 from jsonb_array_elements(trace) v where strava.grinder_is_safe_count(v) is not true)
     or not exists(select 1 from jsonb_array_elements(trace) v where jsonb_typeof(v)='number' and (v::text)::numeric>0) then
   raise exception 'The recorded session must contain activity.';
  end if;
  end if;
  if new.image_url is not null then raise exception 'Use Add photos to upload a photo for this run.'; end if;
  if new.visibility <> 'private' or coalesce(new.crew_shared,false) then
   raise exception 'New sessions start private. Review the saved run before sharing it.';
  end if;
 else
  if new.image_url is distinct from old.image_url and new.image_url is not null then
   raise exception 'Use Add photos to upload a photo for this run.';
  end if;
  foreach field in array array['id','profile_id','created_at','started_at','harness','model','schema_version',
   'measurement_revision','baseline_revision','trace_basis','history_evidence','prompts','duration_s','wall_time_s',
   'tool_calls','shell_calls','files_touched','commits','claims','claims_verified','artifacts_produced',
   'rhythm','route','tool_mix','ridge','worker_bins','commit_bins','ridge_basis','ridge_wall_seconds',
   'ridge_tool_calls','source_actor_id','agent_name','code_route','progress_delta'] loop
   if to_jsonb(new)->field is distinct from to_jsonb(old)->field then
    raise exception 'Recorded session facts cannot be edited. Edit the description, photos or audience instead.';
   end if;
  end loop;
 end if;
 return new;
end $$;
create unique index if not exists runs_owner_historical_source_unique
 on strava.runs(profile_id,(history_evidence->>'source_ref'))
 where trace_basis='historical-reconstruction';
commit;
