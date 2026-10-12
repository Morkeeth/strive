"""Print an atomic, first-install Strava schema. No network or production writes."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
LAST = ('038_share_handle_reservations.sql', '041_private_auth_uid.sql')


def namespaced(sql):
    # These substitutions target schema references, never the PUBLIC role or audience.
    sql = re.sub(r'\bpublic\.', 'strava.', sql)
    sql = re.sub(r'\bsearch_path\s*=\s*public\b', 'search_path=strava, pg_temp', sql, flags=re.I)
    sql = sql.replace("'public'::regnamespace", "'strava'::regnamespace")
    return re.sub(r'^\s*(begin|commit);\s*$', '', sql, flags=re.M | re.I)


def build():
    parts = ['''begin;
-- Refuse to merge with an existing schema. A failed transaction leaves no partial install.
create schema strava;
revoke all on schema strava from public, anon, authenticated;
grant usage on schema strava to anon, authenticated;
set local search_path = strava, pg_temp;
''', (ROOT / 'supabase/strava/base.sql').read_text(), '''
revoke all on profiles,runs,acks from public,anon,authenticated;
grant select on profiles,runs,acks to anon,authenticated;
grant insert,update,delete on profiles,runs to authenticated;
grant insert,delete on acks to authenticated;
''']
    for name in (ROOT / 'scripts/migration-order.txt').read_text().splitlines():
        parts.append('-- ' + name + '\n' + namespaced((ROOT / 'supabase/migrations' / name).read_text()))
    # Strava-only migrations: already strava-qualified, never translated, applied after the inherited list.
    for path in sorted((ROOT / 'supabase/strava').glob('*.sql')):
        if path.name in ('base.sql', 'preflight.sql') + LAST:
            continue
        parts.append('-- strava/' + path.name + '\n' + re.sub(r'^\s*(begin|commit);\s*$', '', path.read_text(), flags=re.M | re.I))
    # Share-handle rules depend on the identity.sql columns and claim trigger. The auth_uid column
    # grant must see every profile column, and replaces identity.sql's handle lookup.
    for name in LAST:
        path = ROOT / 'supabase/strava' / name
        parts.append('-- strava/' + path.name + '\n' + re.sub(r'^\s*(begin|commit);\s*$', '', path.read_text(), flags=re.M | re.I))
    parts.append("notify pgrst, 'reload schema';\ncommit;\n")
    return '\n'.join(parts)


if __name__ == '__main__':
    print(build())
