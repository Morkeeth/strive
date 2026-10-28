-- Remove 061. This deletes every private "Proud of this" mark. 060's export keeps working and
-- returns no marks once this table is gone.
begin;
drop table if exists strava.run_self_marks;
drop function if exists strava.run_self_mark_guard();
commit;
