-- Research consent: a person's own, revocable record that STRIVE may use named parts of their
-- account for research about building with agents. Not applied. Root runs it. Independent of 058.
--
-- Off by default: no row means no consent. A consent names one scope and, optionally, one project.
-- A project consent is checked here against the person's own runs; the UI cannot widen it.
-- Scopes are metadata shaped only. A raw transcript, prompt or session file is not a scope, so it
-- cannot be consented to here, and nothing in this migration collects any content.
-- Consent is separate from reading, saving and publishing: no column, trigger or policy here
-- touches runs, and publishing a run never creates a consent row.
-- Revoke keeps a dated record that consent ended. Delete removes the consent and its history.
-- Export returns everything this file and 059 and 061 store about the caller.
-- Agents cannot grant consent: every function here requires a signed-in person and none accepts
-- an agent token.
begin;

create table if not exists strava.research_consents (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references strava.profiles(id) on delete cascade,
 scope text not null check(scope in ('update_text','run_measurements')),
 project text check(project is null or char_length(project) between 1 and 200),
 version text not null default 'research-consent-v1' check(version='research-consent-v1'),
 granted_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 check(revoked_at is null or revoked_at>=granted_at)
);
create unique index if not exists research_consents_one_active on strava.research_consents(profile_id,scope,coalesce(project,'')) where revoked_at is null;

create table if not exists strava.research_consent_events (
 id bigint generated always as identity primary key,
 profile_id uuid not null references strava.profiles(id) on delete cascade,
 consent_id uuid not null references strava.research_consents(id) on delete cascade,
 event text not null check(event in ('granted','revoked')),
 scope text not null,
 project text,
 at timestamptz not null default clock_timestamp()
);

alter table strava.research_consents enable row level security;
alter table strava.research_consent_events enable row level security;
revoke all on strava.research_consents, strava.research_consent_events from public,anon,authenticated;
-- A person reads only their own rows. All writes go through the functions below.
grant select on strava.research_consents, strava.research_consent_events to authenticated;
drop policy if exists research_consents_own on strava.research_consents;
create policy research_consents_own on strava.research_consents for select to authenticated using(profile_id=strava.grinder_profile_id());
drop policy if exists research_consent_events_own on strava.research_consent_events;
create policy research_consent_events_own on strava.research_consent_events for select to authenticated using(profile_id=strava.grinder_profile_id());

create or replace function strava.grant_research_consent(p_scope text, p_project text default null)
returns uuid language plpgsql security definer set search_path=strava,pg_temp as $$
declare me uuid:=strava.grinder_profile_id(); row strava.research_consents; v_project text:=nullif(trim(p_project),'');
begin
 if me is null then raise exception 'Sign in to choose research use.' using errcode='42501'; end if;
 if p_scope is null or p_scope not in ('update_text','run_measurements') then raise exception 'Choose a supported research scope.' using errcode='22023'; end if;
 if v_project is not null and not exists(select 1 from strava.runs r where r.profile_id=me and r.project=v_project) then
  raise exception 'You can only choose research use for one of your own projects.' using errcode='42501';
 end if;
 perform 1 from strava.profiles where id=me for update;
 select * into row from strava.research_consents c where c.profile_id=me and c.scope=p_scope and coalesce(c.project,'')=coalesce(v_project,'') and c.revoked_at is null;
 if found then return row.id; end if;
 insert into strava.research_consents(profile_id,scope,project) values(me,p_scope,v_project) returning * into row;
 insert into strava.research_consent_events(profile_id,consent_id,event,scope,project) values(me,row.id,'granted',row.scope,row.project);
 return row.id;
end $$;

create or replace function strava.revoke_research_consent(p_consent_id uuid)
returns boolean language plpgsql security definer set search_path=strava,pg_temp as $$
declare me uuid:=strava.grinder_profile_id(); row strava.research_consents;
begin
 if me is null then raise exception 'Sign in to change research use.' using errcode='42501'; end if;
 update strava.research_consents set revoked_at=clock_timestamp() where id=p_consent_id and profile_id=me and revoked_at is null returning * into row;
 if not found then return false; end if;
 insert into strava.research_consent_events(profile_id,consent_id,event,scope,project) values(me,row.id,'revoked',row.scope,row.project);
 return true;
end $$;

-- Null deletes every consent and its history for the caller.
create or replace function strava.delete_research_consent(p_consent_id uuid default null)
returns integer language plpgsql security definer set search_path=strava,pg_temp as $$
declare me uuid:=strava.grinder_profile_id(); n integer;
begin
 if me is null then raise exception 'Sign in to delete research choices.' using errcode='42501'; end if;
 delete from strava.research_consents where profile_id=me and (p_consent_id is null or id=p_consent_id);
 get diagnostics n=row_count;
 return n;
end $$;

-- Everything 059, 060 and 061 hold about the caller, as one JSON document.
create or replace function strava.export_my_feedback_and_consent()
returns jsonb language plpgsql stable security definer set search_path=strava,pg_temp as $$
declare me uuid:=strava.grinder_profile_id();
begin
 if me is null then raise exception 'Sign in to export your data.' using errcode='42501'; end if;
 return jsonb_build_object(
  'format','strive-feedback-consent-export-v1','exported_at',clock_timestamp(),'profile_id',me,
  'research_consents',coalesce((select jsonb_agg(to_jsonb(c) order by c.granted_at) from strava.research_consents c where c.profile_id=me),'[]'::jsonb),
  'research_consent_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from strava.research_consent_events e where e.profile_id=me),'[]'::jsonb),
  'feature_requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from strava.feature_requests r where r.author_profile=me),'[]'::jsonb),
  'feature_votes',coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at) from strava.feature_votes v where v.voter_profile=me),'[]'::jsonb),
  'self_marks',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from strava.run_self_marks m where m.profile_id=me),'[]'::jsonb));
end $$;

revoke all on function strava.grant_research_consent(text,text), strava.revoke_research_consent(uuid),
 strava.delete_research_consent(uuid), strava.export_my_feedback_and_consent() from public,anon;
grant execute on function strava.grant_research_consent(text,text), strava.revoke_research_consent(uuid),
 strava.delete_research_consent(uuid), strava.export_my_feedback_and_consent() to authenticated;

commit;
