-- Remove 059. This deletes every feature request and vote. Apply 060's rollback first: its export
-- function reads these tables.
begin;
drop function if exists strava.set_feature_request_state(uuid,text,text,uuid);
drop function if exists strava.feature_request_board(text,integer,integer);
drop function if exists strava.feature_agent_action(text,text,jsonb,uuid);
drop function if exists strava.vote_feature_request(uuid);
drop function if exists strava.create_feature_request(uuid,text,text,jsonb);
drop function if exists strava.feature_write(uuid,strava.grinder_agents,text,uuid,jsonb);
drop table if exists strava.feature_votes;
drop table if exists strava.feature_requests;
drop function if exists strava.feature_evidence_ok(jsonb);
commit;
