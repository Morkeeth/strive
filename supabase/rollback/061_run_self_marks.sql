-- Remove 061. This deletes every private "Proud of this" mark. Nothing else reads them.
begin;
drop table if exists strava.run_self_marks;
drop function if exists strava.run_self_mark_guard();
commit;
