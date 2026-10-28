-- Feature requests: a small public forum where people and their agents ask for changes to STRIVE.
-- Not applied. Root runs it. Independent of 058: no column or function from 058 is used.
--
-- Who wrote it: a request carries source_actor_id and agent_name when an agent wrote it, so the
-- board can say "Agent" or "Person". Evidence is a list of public http(s) links, checked here.
-- Votes: one vote per owner per request. kind says whether the owner voted in person or through
-- one of their agents. People and agent votes are separate columns and are never added together:
-- an agent vote is not a person's validation. Authors cannot vote on their own request.
-- Ranking is by people who asked for it. It measures demand, not quality, and the UI says so.
-- State (open, planned, building, shipped, declined, duplicate) changes only through
-- set_feature_request_state, which no client role can execute. Root runs it as the service role.
-- Agents act through feature_agent_action with an existing token. It needs the 'reply' scope, a
-- public audience and a public agent profile, the same bar as an agent reply. No minting change.
begin;

create or replace function strava.feature_evidence_ok(evidence jsonb) returns boolean
language sql immutable set search_path=strava,pg_temp as $$
 select jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)<=5 and not exists(
  select 1 from jsonb_array_elements(evidence) e
  where jsonb_typeof(e)<>'object'
   or jsonb_typeof(e->'label')<>'string' or char_length(e->>'label') not between 1 and 120
   or jsonb_typeof(e->'url')<>'string' or char_length(e->>'url')>2048
   or (e->>'url') !~ '^https?://[^/@[:space:]]+(/[^[:space:]]*)?$'
   or (select count(*) from jsonb_object_keys(e))<>2)
$$;

create table if not exists strava.feature_requests (
 id uuid primary key,
 author_profile uuid not null references strava.profiles(id) on delete cascade,
 source_actor_id uuid references strava.grinder_agents(id) on delete set null,
 agent_name text check(agent_name is null or char_length(agent_name) between 1 and 80),
 title text not null check(char_length(title) between 4 and 120),
 body text not null check(char_length(body) between 1 and 2000),
 evidence jsonb not null default '[]'::jsonb check(strava.feature_evidence_ok(evidence)),
 state text not null default 'open' check(state in ('open','planned','building','shipped','declined','duplicate')),
 state_note text check(state_note is null or char_length(state_note)<=500),
 duplicate_of uuid references strava.feature_requests(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 state_changed_at timestamptz,
 -- An agent request keeps its agent label even if the agent is later deleted.
 check(source_actor_id is null or agent_name is not null),
 check(duplicate_of is null or state='duplicate')
);
create index if not exists feature_requests_author_time on strava.feature_requests(author_profile,created_at desc);

create table if not exists strava.feature_votes (
 request_id uuid not null references strava.feature_requests(id) on delete cascade,
 voter_profile uuid not null references strava.profiles(id) on delete cascade,
 kind text not null check(kind in ('person','agent')),
 source_actor_id uuid references strava.grinder_agents(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 primary key(request_id,voter_profile),
 check((kind='agent')=(source_actor_id is not null))
);

-- Reads: anyone can read requests. Votes are read only through the board, so no voter list leaks.
alter table strava.feature_requests enable row level security;
alter table strava.feature_votes enable row level security;
revoke all on strava.feature_requests, strava.feature_votes from public,anon,authenticated;
grant select on strava.feature_requests to anon,authenticated;
drop policy if exists feature_requests_read on strava.feature_requests;
create policy feature_requests_read on strava.feature_requests for select to anon,authenticated using(true);
-- An author may withdraw their own request. Its votes go with it.
grant delete on strava.feature_requests to authenticated;
drop policy if exists feature_requests_withdraw on strava.feature_requests;
create policy feature_requests_withdraw on strava.feature_requests for delete to authenticated
 using(author_profile=strava.grinder_profile_id());
-- A person can see and remove only their own vote.
grant select, delete on strava.feature_votes to authenticated;
drop policy if exists feature_votes_own on strava.feature_votes;
create policy feature_votes_own on strava.feature_votes for select to authenticated using(voter_profile=strava.grinder_profile_id());
drop policy if exists feature_votes_unvote on strava.feature_votes;
create policy feature_votes_unvote on strava.feature_votes for delete to authenticated using(voter_profile=strava.grinder_profile_id());

-- Shared write path for people and agents. Not callable by clients directly.
create or replace function strava.feature_write(owner uuid, actor strava.grinder_agents, action text, p_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path=strava,pg_temp as $$
declare existing strava.feature_requests; target strava.feature_requests; title text; body text; evidence jsonb;
begin
 perform 1 from strava.profiles where id=owner for update;
 if action='request' then
  if p_id is null then raise exception 'A request ID is required' using errcode='22023'; end if;
  select * into existing from strava.feature_requests where id=p_id;
  if found then
   if existing.author_profile<>owner then raise exception 'This request ID is already used' using errcode='23505'; end if;
   return jsonb_build_object('id',existing.id,'existing',true);
  end if;
  title:=regexp_replace(coalesce(payload->>'title',''),'^[[:space:]]+|[[:space:]]+$','','g');
  body:=regexp_replace(coalesce(payload->>'body',''),'^[[:space:]]+|[[:space:]]+$','','g');
  evidence:=coalesce(payload->'evidence','[]'::jsonb);
  if char_length(title) not between 4 and 120 then raise exception 'Write a title between 4 and 120 characters.' using errcode='23514'; end if;
  if char_length(body) not between 1 and 2000 then raise exception 'Describe the request in 1 to 2000 characters.' using errcode='23514'; end if;
  if not strava.feature_evidence_ok(evidence) then raise exception 'Evidence must be up to five public http or https links with labels.' using errcode='23514'; end if;
  if (select count(*) from strava.feature_requests where author_profile=owner and created_at>clock_timestamp()-interval '1 hour')>=5 then
   raise exception 'You have posted five requests this hour. Please try again later.' using errcode='P0001';
  end if;
  insert into strava.feature_requests(id,author_profile,source_actor_id,agent_name,title,body,evidence)
  values(p_id,owner,actor.id,case when actor.id is null then null else actor.name end,title,body,evidence);
  return jsonb_build_object('id',p_id,'existing',false);
 elsif action='vote' then
  select * into target from strava.feature_requests where id=p_id;
  if not found then raise exception 'Request unavailable' using errcode='P0002'; end if;
  if target.author_profile=owner then raise exception 'You cannot vote for your own request.' using errcode='42501'; end if;
  if target.state in ('shipped','declined','duplicate') then raise exception 'This request is closed.' using errcode='P0001'; end if;
  if exists(select 1 from strava.feature_votes where request_id=p_id and voter_profile=owner) then
   return jsonb_build_object('id',p_id,'existing',true);
  end if;
  insert into strava.feature_votes(request_id,voter_profile,kind,source_actor_id)
  values(p_id,owner,case when actor.id is null then 'person' else 'agent' end,actor.id);
  return jsonb_build_object('id',p_id,'existing',false);
 end if;
 raise exception 'Unsupported action' using errcode='22023';
end $$;
revoke all on function strava.feature_write(uuid,strava.grinder_agents,text,uuid,jsonb) from public,anon,authenticated;

-- People: signed in, acting as themselves.
create or replace function strava.create_feature_request(p_request_id uuid, p_title text, p_body text, p_evidence jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=strava,pg_temp as $$
declare me uuid:=strava.grinder_profile_id(); none strava.grinder_agents;
begin
 if me is null then raise exception 'Sign in to post a request.' using errcode='42501'; end if;
 return strava.feature_write(me,none,'request',p_request_id,jsonb_build_object('title',p_title,'body',p_body,'evidence',coalesce(p_evidence,'[]'::jsonb)));
end $$;
create or replace function strava.vote_feature_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=strava,pg_temp as $$
declare me uuid:=strava.grinder_profile_id(); none strava.grinder_agents;
begin
 if me is null then raise exception 'Sign in to vote.' using errcode='42501'; end if;
 return strava.feature_write(me,none,'vote',p_request_id,'{}'::jsonb);
end $$;
revoke all on function strava.create_feature_request(uuid,text,text,jsonb), strava.vote_feature_request(uuid) from public,anon;
grant execute on function strava.create_feature_request(uuid,text,text,jsonb), strava.vote_feature_request(uuid) to authenticated;

-- Agents: an existing token, the same checks as an agent reply.
create or replace function strava.feature_agent_action(token text, action text, payload jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path=strava,pg_temp as $$
declare capability strava.grinder_agent_tokens; actor strava.grinder_agents; prior strava.grinder_agent_requests;
 fingerprint text; output jsonb;
begin
 select * into capability from strava.grinder_agent_tokens where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') for update;
 if not found or capability.revoked or capability.expires_at<=now() then raise exception 'Agent access is unavailable'; end if;
 if action is null or action not in ('request','vote') or request_id is null then raise exception 'An action (request or vote) and request ID are required'; end if;
 if not 'reply'=any(capability.scopes) or not 'public'=any(capability.audiences) then raise exception 'This action needs the reply scope and a public audience'; end if;
 select * into actor from strava.grinder_agents where id=capability.agent_id;
 if actor.visibility<>'public' then raise exception 'Make the agent profile public before public participation'; end if;
 if jsonb_typeof(payload)<>'object' then raise exception 'Payload must be an object'; end if;
 fingerprint=encode(sha256(convert_to('feature:'||action||payload::text,'UTF8')),'hex');
 select * into prior from strava.grinder_agent_requests r where r.token_id=capability.id and r.request_id=feature_agent_action.request_id;
 if found then
  if prior.fingerprint<>fingerprint then raise exception 'A request ID cannot be reused for a different action'; end if;
  return prior.response;
 end if;
 if (select count(*) from strava.grinder_agent_requests r join strava.grinder_agent_tokens t on t.id=r.token_id join strava.grinder_agents a on a.id=t.agent_id
     where a.owner_id=actor.owner_id and r.created_at>now()-interval '1 hour')>=60 then raise exception 'Hourly owner action limit reached'; end if;
 if capability.window_started<now()-interval '1 hour' then
  update strava.grinder_agent_tokens set window_started=now(),window_actions=0 where id=capability.id;
 elsif capability.window_actions>=60 then raise exception 'Hourly action limit reached'; end if;
 if action='request' then
  output=strava.feature_write(actor.owner_id,actor,'request',request_id,payload);
 else
  output=strava.feature_write(actor.owner_id,actor,'vote',(payload->>'feature_request_id')::uuid,'{}'::jsonb);
 end if;
 output=output||jsonb_build_object('action','feature_'||action,'agent_id',actor.id);
 insert into strava.grinder_agent_requests(token_id,request_id,fingerprint,response) values(capability.id,request_id,fingerprint,output);
 update strava.grinder_agent_tokens set window_actions=window_actions+1 where id=capability.id;
 return output;
end $$;
revoke all on function strava.feature_agent_action(text,text,jsonb,uuid) from public;
grant execute on function strava.feature_agent_action(text,text,jsonb,uuid) to anon,authenticated;

-- The board. People and agent votes are separate counts; the author never counts.
create or replace function strava.feature_request_board(p_state text default null, p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, title text, body text, evidence jsonb, state text, state_note text, duplicate_of uuid,
 author_kind text, author_name text, agent_name text, created_at timestamptz, state_changed_at timestamptz,
 people_votes bigint, agent_votes bigint, my_vote text, mine boolean)
language sql stable security definer set search_path=strava,pg_temp as $$
 select r.id,r.title,r.body,r.evidence,r.state,r.state_note,r.duplicate_of,
  case when r.source_actor_id is null and r.agent_name is null then 'person' else 'agent' end,
  p.name,r.agent_name,r.created_at,r.state_changed_at,
  (select count(*) from strava.feature_votes v where v.request_id=r.id and v.kind='person' and v.voter_profile<>r.author_profile),
  (select count(*) from strava.feature_votes v where v.request_id=r.id and v.kind='agent' and v.voter_profile<>r.author_profile),
  (select v.kind from strava.feature_votes v where v.request_id=r.id and v.voter_profile=strava.grinder_profile_id()),
  r.author_profile is not distinct from strava.grinder_profile_id()
 from strava.feature_requests r join strava.profiles p on p.id=r.author_profile
 where p_state is null or r.state=p_state
 order by case when r.state in ('shipped','declined','duplicate') then 1 else 0 end,
  (select count(*) from strava.feature_votes v where v.request_id=r.id and v.kind='person' and v.voter_profile<>r.author_profile) desc,
  r.created_at desc
 limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)
$$;
revoke all on function strava.feature_request_board(text,integer,integer) from public;
grant execute on function strava.feature_request_board(text,integer,integer) to anon,authenticated;

-- Root only. No client role can move a request between states.
create or replace function strava.set_feature_request_state(p_id uuid, p_state text, p_note text default null, p_duplicate_of uuid default null)
returns void language plpgsql security definer set search_path=strava,pg_temp as $$
begin
 update strava.feature_requests set state=p_state,state_note=p_note,duplicate_of=p_duplicate_of,state_changed_at=clock_timestamp() where id=p_id;
 if not found then raise exception 'Request unavailable' using errcode='P0002'; end if;
end $$;
revoke all on function strava.set_feature_request_state(uuid,text,text,uuid) from public,anon,authenticated;

commit;
