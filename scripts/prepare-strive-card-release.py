"""Print a guarded, atomic STRIVE-only 034+035 bundle. Never connects or applies SQL."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
print("""begin;
-- Review and apply only to STRIVE's dedicated strava schema.
-- Fresh API cache absence is not proof of SQL absence; these guards are authoritative.
do $$ begin
 if to_regclass('strava.profiles') is null or to_regclass('strava.runs') is null
 or to_regclass('strava.run_photos') is null
 or to_regprocedure('strava.grinder_profile_id()') is null
 or to_regprocedure('strava.grinder_can_read_run(uuid)') is null then
  raise exception 'STRIVE base schema missing; abort';
 end if;
 if to_regclass('strava.day_card_choices') is not null or to_regclass('strava.project_follows') is not null
 or to_regprocedure('strava.save_day_card(text,jsonb)') is not null
 or to_regprocedure('strava.read_day_card(uuid,text,text)') is not null then
  raise exception '034 or 035 already exists or partially exists; inspect before proceeding';
 end if;
 if exists(select 1 from strava.profiles where rig ? 'day_cards' and jsonb_typeof(rig->'day_cards') <> 'object') then
  raise exception 'Invalid legacy card container; preserve and repair before migration';
 end if;
 if exists(select 1 from strava.profiles p,
 lateral jsonb_each(case when jsonb_typeof(p.rig->'day_cards')='object' then p.rig->'day_cards' else '{}'::jsonb end) c
 where c.key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 or jsonb_typeof(c.value) <> 'object' or octet_length(c.value::text)>32768) then
  raise exception 'Invalid legacy card entry; preserve and repair before migration';
 end if;
end $$;
""")
for name in ['034_private_day_card_choices.sql', '035_project_follows.sql']:
    source = (root / 'supabase/strava' / name).read_text()
    source = re.sub(r'^\s*(begin|commit);\s*$', '', source, flags=re.M | re.I)
    print('-- ' + name + '\n' + source)
print('commit;')
