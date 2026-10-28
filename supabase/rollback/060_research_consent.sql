-- Remove 060. This deletes every research consent and its history. Run it only if no research
-- use has started, or keep an export first: people must be able to see what they agreed to.
begin;
drop function if exists strava.export_my_feedback_and_consent();
drop function if exists strava.delete_research_consent(uuid);
drop function if exists strava.revoke_research_consent(uuid);
drop function if exists strava.grant_research_consent(text,text);
drop table if exists strava.research_consent_events;
drop table if exists strava.research_consents;
commit;
