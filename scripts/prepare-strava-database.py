"""Print an atomic, first-install Strava schema. No network or production writes."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SHARE_HANDLES = '038_share_handle_reservations.sql'
# From this number on, files are applied in number order after everything else, as in production.
FIRST_IN_NUMBER_ORDER = 42


def in_number_order(name):
    number = re.match(r'(\d{3})_', name)
    return bool(number) and int(number.group(1)) >= FIRST_IN_NUMBER_ORDER


def strava_order(names):
    """Unnumbered files and files below 042 by name, then 038, then 042 and every later number."""
    names = sorted(name for name in names if name not in ('base.sql', 'preflight.sql'))
    early = [name for name in names if name != SHARE_HANDLES and not in_number_order(name)]
    return early + [SHARE_HANDLES] + [name for name in names if in_number_order(name)]


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
    # Share-handle rules (038) depend on the identity.sql columns and claim trigger, so 038 follows
    # the unnumbered files. 042 grants SELECT on every profile column that exists, so it must also
    # follow identity.sql, and it replaces identity.sql's handle lookup. Files numbered after 042
    # run after it, so a test on this install sees what a later migration does to the 042 grants.
    for name in strava_order(path.name for path in (ROOT / 'supabase/strava').glob('*.sql')):
        text = (ROOT / 'supabase/strava' / name).read_text()
        parts.append('-- strava/' + name + '\n' + re.sub(r'^\s*(begin|commit);\s*$', '', text, flags=re.M | re.I))
    parts.append("notify pgrst, 'reload schema';\ncommit;\n")
    return '\n'.join(parts)


if __name__ == '__main__':
    print(build())
