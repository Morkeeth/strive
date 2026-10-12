"""Ridge persistence: the migration, the Save path, the read back, and the share image."""
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
PREVIEW = (ROOT / "server" / "public-run.mjs").read_text()
MIGRATION = (ROOT / "supabase" / "strava" / "003_ridge_persistence.sql").read_text()

FIELDS = ("ridge", "worker_bins", "commit_bins", "ridge_basis", "ridge_wall_seconds",
          "ridge_tool_calls")
# Comments explain the migration. Only the statements are the contract.
SQL = "\n".join(line for line in MIGRATION.splitlines() if not line.lstrip().startswith("--"))


def test_ridge_round_trip_and_excluded_reader_with_disposable_postgres():
    subprocess.run(
        ["node", str(ROOT / "scripts" / "test-ridge-persistence.mjs")],
        cwd=ROOT,
        check=True,
    )


def test_migration_adds_every_field_the_client_sends():
    added = [line.strip() for line in SQL.splitlines() if "add column if not exists" in line]
    assert len(added) == len(FIELDS)
    for field in FIELDS:
        # Nullable, no backfill: a run saved before 003 keeps its rhythm trace.
        assert any(f"add column if not exists {field} " in line and "not null" not in line
                   for line in added), field
    assert "update strava.runs" not in SQL.lower()
    # cursor_tree.ridge_from_calls returns round(seconds, 1), so the column is not an integer.
    assert "ridge_wall_seconds double precision" in SQL
    assert "ridge_basis in ('wall-time', 'call-index')" in SQL
    assert "jsonb_array_length(ridge) between 40 and 60" in SQL


def test_migration_changes_no_policy_or_grant():
    lowered = SQL.lower()
    for forbidden in ("create policy", "drop policy", "grant ", "revoke ", "row level security"):
        assert forbidden not in lowered, forbidden + " must stay in 002_close_friends.sql"


def test_save_path_sends_the_ridge():
    # Exercise the same row builder used by preview and Save, including deselection.
    script = "const R=require('./site/import-row.js');const source={ridge:Array(50).fill(2),worker_bins:Array(50).fill(1),commit_bins:[3,17],ridge_basis:'wall-time',ridge_wall_seconds:600,ridge_tool_calls:100};const opts={profileId:'owner',title:'Run',project:'project'};const row=R.build(source,opts);for(const field of "+repr(list(FIELDS))+" )if(JSON.stringify(row[field])!==JSON.stringify(source[field]))throw Error(field);const omitted=R.build(source,{...opts,metricChoices:{tool_calls:false}});for(const field of ['ridge','worker_bins','ridge_basis','ridge_wall_seconds','ridge_tool_calls'])if(field in omitted)throw Error('deselected '+field);"
    subprocess.run(['node','-e',script],cwd=ROOT,check=True)


def test_run_view_and_feed_read_every_column_back():
    # Both the run view and the public feed select every column, so the ridge returns with the
    # row once the columns exist.
    assert INDEX.count("sb.from('runs').select('*, profiles!runs_profile_id_fkey") >= 3


def test_public_preview_select_carries_the_ridge():
    for field in FIELDS:
        assert field in PREVIEW.split("limit:'1'")[0]


def test_share_image_prefers_the_persisted_ridge():
    script = "const L=require('./site/link-preview-card.js');const ridge=Array(50).fill(2);if(JSON.stringify(L.series({ridge,rhythm:[1,4,2]}).values)!==JSON.stringify(ridge))throw Error('ridge lost');const old=L.series({rhythm:[1,4,2]});if(old.filled||old.values.length!==3)throw Error('legacy rhythm lost');if(L.series({ridge:null,rhythm:[0,0,0]}))throw Error('invented flat trace');"
    subprocess.run(['node','-e',script],cwd=ROOT,check=True)
