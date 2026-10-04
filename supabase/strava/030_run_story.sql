-- Author-written context follows the existing run audience and owner-only update policy.
begin;
alter table strava.runs
 add column if not exists story_result text check (char_length(story_result)<=2000),
 add column if not exists story_next text check (char_length(story_next)<=1000),
 add column if not exists feedback_question text check (char_length(feedback_question)<=500);
commit;
