-- Applied by the Fable database gate on 12 October 2026 as agent_run_review_041.
-- Gate readback: security definer/execute ACL unchanged; 10 private and 1 link agent runs unchanged.
-- Agent run review: no credential can publish a new visible run. Owner confirmation stays in the UI.
begin;
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
 if action in ('draft','publish') then payload=jsonb_set(payload,'{visibility}','"private"'::jsonb); end if;
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
  audience='private'; -- Agents prepare private drafts. Only the owner UI can change audience.
  if not audience=any(capability.audiences) then raise exception 'This audience is outside the granted scope'; end if;
  if audience='public' and actor.visibility<>'public' then raise exception 'Make the agent profile public before public participation'; end if;
  if action='draft' then
   insert into grinder_agent_drafts(owner_id,agent_id,payload) values(actor.owner_id,actor.id,payload) returning id into result_id;
  else
   if payload->>'measurement_revision' is not null then
    select id into result_id from runs where profile_id=actor.owner_id and measurement_revision=payload->>'measurement_revision';
    if found then
     if (select visibility from runs where id=result_id)<>'private' then
      return jsonb_build_object('id',result_id,'action',action,'agent_id',actor.id,'existing',true,'visibility',(select visibility from runs where id=result_id),'review_required',false);
     end if;
     existing=true;
    end if;
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
 if action in ('draft','publish') then
  output=output||jsonb_build_object('review_required',true,'preview_url','https://striverun.app/#import='||replace(encode(convert_to((payload||case when action='publish' then jsonb_build_object('review_run_id',result_id) else '{}'::jsonb end)::text,'UTF8'),'base64'),E'\n',''));
 end if;
 insert into grinder_agent_requests(token_id,request_id,fingerprint,response) values(capability.id,request_id,fingerprint,output);
 update grinder_agent_tokens set window_actions=window_actions+1 where id=capability.id;
 return output;
end $function$;

commit;
