-- Unknown workers stay NULL. All other payload validation is preserved from009.
-- No grants, policies, audiences, token scopes or historical facts change.
begin;
alter table strava.runs drop constraint if exists runs_ridge_shape_check;
alter table strava.runs add constraint runs_ridge_shape_check check (
 ridge is null or (
  jsonb_typeof(ridge)='array' and jsonb_array_length(ridge) between 40 and 60
  and (worker_bins is null or (jsonb_typeof(worker_bins)='array'
       and jsonb_array_length(worker_bins)=jsonb_array_length(ridge)))
  and (commit_bins is null or jsonb_typeof(commit_bins)='array')
 )
);
comment on column strava.runs.worker_bins is 'Measured concurrent workers per bin, same length as ridge; NULL means unknown, not zero.';

create or replace function strava.grinder_check_agent_payload(payload jsonb)
 returns void
 language plpgsql
 set search_path to 'strava', 'pg_temp'
as $function$
declare field text; value jsonb; n integer; route jsonb;
begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>65536 then raise exception 'Send a grind object under 64 KiB'; end if;
 for field,value in select * from jsonb_each(payload) loop
  if not field=any(array['title','project','harness','turns_typed','duration_s','tool_calls','files_touched','commits','claims','claims_verified','artifacts_produced','started','visibility','rhythm','route','schema_version','measurement_revision','baseline_revision','trace_basis','note','run_id','body','reason','question_id',
    'ridge','worker_bins','commit_bins','ridge_basis','ridge_wall_seconds','ridge_tool_calls','wall_time_s','shell_calls','model','caption',
    'repo_url','receipts','shipped','artifact_url','image_url',
    'code_route']) then raise exception 'Unsupported public field: %',field; end if;
  if field=any(array['turns_typed','tool_calls','files_touched','commits','claims','claims_verified','artifacts_produced','ridge_tool_calls','wall_time_s','shell_calls']) and value<>'null'::jsonb then
   if jsonb_typeof(value)<>'number' or (value::text)::numeric<0 or (value::text)::numeric<>floor((value::text)::numeric) or (value::text)::numeric>2147483647 then raise exception 'Counts must be non-negative whole numbers'; end if;
  end if;
 end loop;
 for field in select unnest(array['title','project','harness','started','visibility','trace_basis','note','body','reason','ridge_basis','caption','model']) loop
  if payload ? field and payload->field<>'null'::jsonb and jsonb_typeof(payload->field)<>'string' then raise exception '% must be text',field; end if;
 end loop;
 if payload->>'claims_verified' is not null and payload->>'claims' is null then raise exception 'Verified claims require a counted-claims total'; end if;
 if (payload->>'claims_verified')::integer>(payload->>'claims')::integer then raise exception 'Verified claims exceed counted claims'; end if;
 if payload ? 'duration_s' and payload->'duration_s'<>'null'::jsonb and (jsonb_typeof(payload->'duration_s')<>'number' or (payload->>'duration_s')::numeric<0) then raise exception 'Invalid duration'; end if;
 for field in select unnest(array['measurement_revision','baseline_revision']) loop
  if payload->field<>'null'::jsonb and (jsonb_typeof(payload->field)<>'string' or payload->>field!~'^[a-f0-9]{64}$') then raise exception 'Invalid measurement reference'; end if;
 end loop;
 if payload ? 'schema_version' and payload->>'schema_version'<>'1' then raise exception 'Unsupported grind format'; end if;
 if payload ? 'ridge' and payload->'ridge'<>'null'::jsonb then
  if jsonb_typeof(payload->'ridge')<>'array' then raise exception 'A ridge must be an array of bin values'; end if;
  n=jsonb_array_length(payload->'ridge');
  if n<40 or n>60 then raise exception 'A ridge needs 40 to 60 bins'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'ridge') v where not strava.grinder_is_safe_count(v)) then raise exception 'Ridge bins must be non-negative whole numbers'; end if;
  if payload ? 'worker_bins' and payload->'worker_bins'<>'null'::jsonb then
  if jsonb_typeof(payload->'worker_bins') is distinct from 'array' or jsonb_array_length(payload->'worker_bins')<>n then raise exception 'worker_bins must be an array the same length as the ridge'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'worker_bins') v where not strava.grinder_is_safe_count(v)) then raise exception 'worker_bins must be non-negative whole numbers'; end if;
  end if;
  if coalesce(payload->>'ridge_basis','')<>all(array['wall-time','call-index','turn-order']) then raise exception 'ridge_basis must be wall-time, call-index or turn-order'; end if;
  if payload ? 'commit_bins' and payload->'commit_bins'<>'null'::jsonb then
   if jsonb_typeof(payload->'commit_bins')<>'array' then raise exception 'commit_bins must be an array'; end if;
   if jsonb_array_length(payload->'commit_bins')>n then raise exception 'commit_bins cannot be longer than the ridge'; end if;
   if exists(select 1 from jsonb_array_elements(payload->'commit_bins') v where not strava.grinder_is_safe_count(v) or (v::text)::numeric>=n) then raise exception 'commit_bins must be ridge bin indexes from 0 to %',n-1; end if;
  end if;
 elsif (payload ? 'worker_bins' and payload->'worker_bins'<>'null'::jsonb) or (payload ? 'commit_bins' and payload->'commit_bins'<>'null'::jsonb)
   or (payload ? 'ridge_basis' and payload->'ridge_basis'<>'null'::jsonb) then
  raise exception 'worker_bins, commit_bins and ridge_basis need a ridge';
 end if;
 if payload ? 'ridge_wall_seconds' and payload->'ridge_wall_seconds'<>'null'::jsonb and (jsonb_typeof(payload->'ridge_wall_seconds')<>'number' or (payload->>'ridge_wall_seconds')::numeric<0) then raise exception 'Invalid ridge_wall_seconds'; end if;
 if payload ? 'caption' and payload->'caption'<>'null'::jsonb and length(trim(payload->>'caption')) not between 1 and 280 then raise exception 'A caption is 1 to 280 characters'; end if;
 if payload ? 'model' and payload->'model'<>'null'::jsonb and length(trim(payload->>'model')) not between 1 and 120 then raise exception 'A model name is 1 to 120 characters'; end if;
 for field in select unnest(array['repo_url','artifact_url','image_url']) loop
  if payload ? field and payload->field<>'null'::jsonb then
   if jsonb_typeof(payload->field)<>'string' then raise exception '% must be text',field; end if;
   if not strava.grinder_is_safe_url(payload->>field) then raise exception '% must be one https link under 300 characters',field; end if;
  end if;
 end loop;
 if payload ? 'repo_url' and payload->'repo_url'<>'null'::jsonb and payload->>'repo_url' !~* '^https://(github\.com|gitlab\.com|codeberg\.org)/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+' then
  raise exception 'repo_url must be a repository on github.com, gitlab.com or codeberg.org'; end if;
 if payload ? 'image_url' and payload->'image_url'<>'null'::jsonb and payload->>'image_url' !~* '\.(png|jpe?g|webp)([?#].*)?$' then
  raise exception 'image_url must end in .png, .jpg, .jpeg or .webp'; end if;
 if payload ? 'shipped' and payload->'shipped'<>'null'::jsonb then
  if jsonb_typeof(payload->'shipped')<>'array' then raise exception 'shipped must be an array of short lines'; end if;
  if jsonb_array_length(payload->'shipped')>5 then raise exception 'shipped holds at most 5 lines'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'shipped') v where jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 1 and 120) then
   raise exception 'each shipped line is text, 1 to 120 characters'; end if;
 end if;
 if payload ? 'receipts' and payload->'receipts'<>'null'::jsonb then
  if jsonb_typeof(payload->'receipts')<>'array' then raise exception 'receipts must be an array'; end if;
  if jsonb_array_length(payload->'receipts')>5 then raise exception 'receipts holds at most 5 links'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'receipts') v where jsonb_typeof(v)<>'object'
      or (select count(*) from jsonb_object_keys(v) k where k<>all(array['label','url']))>0
      or jsonb_typeof(v->'label') is distinct from 'string' or length(trim(v->>'label')) not between 1 and 60
      or jsonb_typeof(v->'url') is distinct from 'string' or not strava.grinder_is_safe_url(v->>'url')) then
   raise exception 'each receipt is {label, url}: a label of 1 to 60 characters and one https link'; end if;
 end if;
 -- Code Route: bounded object, version 1, no absolute/home paths in string leaves.
 if payload ? 'code_route' and payload->'code_route'<>'null'::jsonb then
  route=payload->'code_route';
  if jsonb_typeof(route)<>'object' then raise exception 'code_route must be an object'; end if;
  if (route->>'v') is distinct from '1' then raise exception 'code_route.v must be 1'; end if;
  if octet_length(route::text)>16384 then raise exception 'code_route is too large'; end if;
  if exists(select 1 from jsonb_path_query(route,'strict $.** ? (@.type() == "string")') s
            where (s#>>'{}') ~ '(/Users/|/home/|^~/|[A-Za-z]:\\|\\\\)'
               or (s#>>'{}') ~* '(api[_-]?key|password|bearer |sk-[a-z0-9]{8,}|prompt\s*:)'
               or (s#>>'{}') ~* '(\mL[0-9]+\M|\mprivate\M)') then
   raise exception 'code_route must not carry paths, secrets or private lane labels';
  end if;
 end if;
end $function$;

commit;
