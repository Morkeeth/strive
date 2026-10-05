-- Preserve the existing scoped agent RPC and carry recorded metadata through publish.
begin;
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
    'code_route','capture_metadata']) then raise exception 'Unsupported public field: %',field; end if;
  if field=any(array['turns_typed','tool_calls','files_touched','commits','claims','claims_verified','artifacts_produced','ridge_tool_calls','wall_time_s','shell_calls']) and value<>'null'::jsonb then
   if jsonb_typeof(value)<>'number' or (value::text)::numeric<0 or (value::text)::numeric<>floor((value::text)::numeric) or (value::text)::numeric>2147483647 then raise exception 'Counts must be non-negative whole numbers'; end if;
  end if;
 end loop;
 -- Validate nested recorded facts before either private draft or published run storage.
 perform strava.check_capture_metadata(nullif(payload->'capture_metadata','null'::jsonb),payload->>'trace_basis');
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

create or replace function strava.grinder_agent_action(token text, action text, payload jsonb, request_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'strava', 'pg_temp'
as $function$
declare capability grinder_agent_tokens; actor grinder_agents; prior grinder_agent_requests;
 fingerprint text; output jsonb; target runs; result_id uuid; audience text; existing boolean:=false;
begin
 select * into capability from grinder_agent_tokens where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') for update;
 if not found or capability.revoked or capability.expires_at<=now() then raise exception 'Agent access is unavailable'; end if;
 if action is null or request_id is null then raise exception 'An action and request ID are required'; end if;
 if not action=any(capability.scopes) then raise exception 'This action is outside the granted scope'; end if;
 select * into actor from grinder_agents where id=capability.agent_id;
 perform 1 from profiles where id=actor.owner_id for update;
 perform grinder_check_agent_payload(payload);
 fingerprint=encode(sha256(convert_to(action||payload::text,'UTF8')),'hex');
 select * into prior from grinder_agent_requests r where r.token_id=capability.id and r.request_id=grinder_agent_action.request_id;
 if found then
  if prior.fingerprint<>fingerprint then raise exception 'A request ID cannot be reused for a different action'; end if;
  return prior.response;
 end if;
 if (select count(*) from grinder_agent_requests r join grinder_agent_tokens t on t.id=r.token_id join grinder_agents a on a.id=t.agent_id where a.owner_id=actor.owner_id and r.created_at>now()-interval '1 hour')>=60 then raise exception 'Hourly owner action limit reached'; end if;
 if capability.window_started<now()-interval '1 hour' then
  update grinder_agent_tokens set window_started=now(),window_actions=0 where id=capability.id;
 elsif capability.window_actions>=60 then raise exception 'Hourly action limit reached'; end if;
 if action in ('draft','publish') then
  audience=case when action='draft' then 'private' else coalesce(payload->>'visibility','private') end;
  if not audience=any(capability.audiences) then raise exception 'This audience is outside the granted scope'; end if;
  if audience='public' and actor.visibility<>'public' then raise exception 'Make the agent profile public before public participation'; end if;
  if action='draft' then
   insert into grinder_agent_drafts(owner_id,agent_id,payload) values(actor.owner_id,actor.id,payload) returning id into result_id;
  else
   if payload->>'measurement_revision' is not null then
    select id into result_id from runs where profile_id=actor.owner_id and measurement_revision=payload->>'measurement_revision';
    if found then existing=true; end if;
   end if;
   if not existing then
    insert into runs(profile_id,title,project,harness,prompts,duration_s,tool_calls,files_touched,commits,claims,claims_verified,artifacts_produced,visibility,started_at,source_actor_id,agent_name,schema_version,measurement_revision,baseline_revision,rhythm,route,note,trace_basis,
     ridge,worker_bins,commit_bins,ridge_basis,ridge_wall_seconds,ridge_tool_calls,wall_time_s,shell_calls,model,caption,
     repo_url,receipts,shipped,artifact_url,image_url,code_route,capture_metadata)
    values(actor.owner_id,left(coalesce(payload->>'title','Agent grind'),200),left(payload->>'project',200),left(payload->>'harness',100),
     (payload->>'turns_typed')::integer,(payload->>'duration_s')::double precision,(payload->>'tool_calls')::integer,
     (payload->>'files_touched')::integer,(payload->>'commits')::integer,(payload->>'claims')::integer,(payload->>'claims_verified')::integer,
     (payload->>'artifacts_produced')::integer,audience,(payload->>'started')::timestamptz,actor.id,actor.name,1,payload->>'measurement_revision',payload->>'baseline_revision',payload->'rhythm',payload->'route',left(payload->>'note',4000),left(payload->>'trace_basis',200),
     nullif(payload->'ridge','null'::jsonb),nullif(payload->'worker_bins','null'::jsonb),nullif(payload->'commit_bins','null'::jsonb),payload->>'ridge_basis',
     (payload->>'ridge_wall_seconds')::double precision,(payload->>'ridge_tool_calls')::integer,(payload->>'wall_time_s')::integer,(payload->>'shell_calls')::integer,
     nullif(trim(payload->>'model'),''),nullif(trim(payload->>'caption'),''),
     nullif(payload->>'repo_url',''),nullif(payload->'receipts','null'::jsonb),nullif(payload->'shipped','null'::jsonb),
     nullif(payload->>'artifact_url',''),nullif(payload->>'image_url',''),nullif(payload->'code_route','null'::jsonb),nullif(payload->'capture_metadata','null'::jsonb))
    returning id into result_id;
   end if;
  end if;
 elsif action in ('reply','ack') then
  select * into target from runs where id=(payload->>'run_id')::uuid;
  if not found then raise exception 'Grind unavailable'; end if;
  audience=case when target.visibility in ('public','anonymous') then 'public' else 'private' end;
  if not audience=any(capability.audiences) or (audience='private' and target.profile_id<>actor.owner_id) then raise exception 'This grind is outside the granted audience'; end if;
  if audience='public' and actor.visibility<>'public' then raise exception 'Make the agent profile public before public participation'; end if;
  if action='reply' then
   insert into grinder_replies(run_id,author_id,body,source_actor_id,agent_name,question_id) values(target.id,actor.owner_id,payload->>'body',actor.id,actor.name,(payload->>'question_id')::uuid) returning id into result_id;
  else
   if target.profile_id=actor.owner_id then raise exception 'An agent cannot ACK its owner'; end if;
   if payload->>'reason' is null or payload->>'reason'<>all(array['shipped','focus','pace','rig','comeback','handoff']) then raise exception 'Choose a supported ACK reason'; end if;
   if exists(select 1 from acks where from_profile=actor.owner_id and run_id=target.id) then raise exception 'This owner already ACKed the grind'; end if;
   insert into acks(from_profile,to_profile,run_id,reason,same_owner) values(actor.owner_id,target.profile_id,target.id,payload->>'reason',false) returning id into result_id;
  end if;
 else raise exception 'Unsupported agent action';
 end if;
 output=jsonb_build_object('id',result_id,'action',action,'agent_id',actor.id);
 if action='publish' then output=output||jsonb_build_object('existing',existing,'visibility',(select visibility from runs where id=result_id)); end if;
 insert into grinder_agent_requests(token_id,request_id,fingerprint,response) values(capability.id,request_id,fingerprint,output);
 update grinder_agent_tokens set window_actions=window_actions+1 where id=capability.id;
 return output;
end $function$;

commit;
