-- Remove 061. This deletes every private "Proud of this" mark. Roll back 060 first: its export
-- function reads this table, and export fails while 060 stays without 061.
begin;
drop table if exists strava.run_self_marks;
drop function if exists strava.run_self_mark_guard();
commit;
