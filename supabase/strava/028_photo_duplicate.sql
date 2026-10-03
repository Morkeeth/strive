-- Exact sanitized-image identity is scoped to one run, never another account/run.
begin;
alter table strava.run_photos add column if not exists content_sha256 text
 check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$');
create unique index if not exists run_photos_content_unique
 on strava.run_photos(run_id,content_sha256) where content_sha256 is not null;
commit;
