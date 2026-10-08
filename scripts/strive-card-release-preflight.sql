-- READ ONLY. Run in the existing STRIVE project SQL editor before approving the bundle.
select current_database() as database_name,
 to_regclass('strava.day_card_choices') as day_card_choices,
 to_regclass('strava.project_follows') as project_follows,
 to_regprocedure('strava.save_day_card(text,jsonb)') as save_day_card,
 to_regprocedure('strava.read_day_card(uuid,text,text)') as read_day_card;
-- Aggregate only: do not expose private titles, photo choices or profile identifiers.
select count(*) filter (where rig ? 'day_cards') as profiles_with_legacy_choices,
 count(*) filter (where rig ? 'day_cards' and jsonb_typeof(rig->'day_cards') <> 'object') as invalid_legacy_containers
from strava.profiles;
select count(*) as invalid_legacy_entries from strava.profiles p,
lateral jsonb_each(case when jsonb_typeof(p.rig->'day_cards')='object' then p.rig->'day_cards' else '{}'::jsonb end) c
where c.key !~ '^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$'
or jsonb_typeof(c.value) <> 'object' or octet_length(c.value::text)>32768;
