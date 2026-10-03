begin;
alter table strava.alpha_feedback add column if not exists request_id uuid;
create unique index if not exists alpha_feedback_request on strava.alpha_feedback(profile_id,request_id) where request_id is not null;
create or replace function strava.save_feedback(p_request_id uuid,p_category text,p_message text) returns uuid
language plpgsql security definer set search_path=strava,pg_temp as $$
declare owner_id uuid:=strava.grinder_profile_id(); saved_id uuid;
begin
 if owner_id is null then raise exception 'Sign in to save feedback.' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Request ID required.' using errcode='23514'; end if;
 perform 1 from strava.profiles where id=owner_id for update;
 select id into saved_id from strava.alpha_feedback where profile_id=owner_id and request_id=p_request_id;
 if saved_id is not null then
  if not exists(select 1 from strava.alpha_feedback where id=saved_id and category=p_category and message=regexp_replace(p_message,'^[[:space:]]+|[[:space:]]+$','','g')) then
   raise exception 'Retry content changed. Start a new feedback request.' using errcode='23514';
  end if;
  return saved_id;
 end if;
 insert into strava.alpha_feedback(profile_id,request_id,category,message,page)
 values(owner_id,p_request_id,p_category,p_message,'/') returning id into saved_id;
 return saved_id;
end $$;
revoke all on function strava.save_feedback(uuid,text,text) from public,anon;
grant execute on function strava.save_feedback(uuid,text,text) to authenticated;
-- Exact current saved rows, not productivity or an all-time achievement claim.
create or replace function strava.saved_run_count() returns bigint
language sql stable security invoker set search_path=strava,pg_temp as $$
 select count(*) from strava.runs where profile_id=strava.grinder_profile_id()
$$;
revoke all on function strava.saved_run_count() from public,anon;
grant execute on function strava.saved_run_count() to authenticated;
notify pgrst, 'reload schema';
commit;
