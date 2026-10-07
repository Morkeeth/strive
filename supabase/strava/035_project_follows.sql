begin;
create table strava.project_follows (
  profile_id uuid not null references strava.profiles(id) on delete cascade,
  project text not null check (length(project) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (profile_id, project)
);
alter table strava.project_follows enable row level security;
revoke all on strava.project_follows from public, anon, authenticated;
grant select, insert, delete on strava.project_follows to authenticated;
create policy project_follows_read on strava.project_follows for select to authenticated
  using (profile_id = strava.grinder_profile_id());
create policy project_follows_remove on strava.project_follows for delete to authenticated
  using (profile_id = strava.grinder_profile_id());
create policy project_follows_add on strava.project_follows for insert to authenticated
  with check (profile_id = strava.grinder_profile_id() and exists (
    select 1 from strava.runs r where r.project = project_follows.project
    and r.visibility = 'public' and strava.grinder_can_read_run(r.id)
  ));
create index project_follows_recent on strava.project_follows(profile_id, created_at desc);
notify pgrst, 'reload schema';
commit;
