"""The disposable install must apply migrations numbered 042 and later in production order."""
import importlib.util
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(root):
    spec = importlib.util.spec_from_file_location("prepare_strava_database", ROOT / "scripts/prepare-strava-database.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = root
    return module


def test_a_later_migration_is_applied_after_042(tmp_path):
    shutil.copytree(ROOT / "supabase", tmp_path / "supabase")
    (tmp_path / "scripts").mkdir()
    shutil.copy(ROOT / "scripts/migration-order.txt", tmp_path / "scripts/migration-order.txt")
    strava = tmp_path / "supabase/strava"
    (strava / "043_zz_later.sql").write_text("select 43;\n")
    (strava / "107_zz_much_later.sql").write_text("select 107;\n")

    install = load(tmp_path).build()
    at = lambda name: install.index("-- strava/" + name + "\n")

    # identity.sql adds profile columns, so the 042 column grant must still come after it.
    assert at("identity.sql") < at("038_share_handle_reservations.sql") < at("042_private_auth_uid.sql")
    # Production applies files in number order. A later file runs after 042 here too, so a test
    # that boots this install sees what a later migration does to the 042 grants.
    assert at("042_private_auth_uid.sql") < at("043_zz_later.sql") < at("107_zz_much_later.sql")
    assert at("041_agent_run_review.sql") < at("042_private_auth_uid.sql")
    assert install.count("-- strava/043_zz_later.sql\n") == 1


def test_every_strava_file_is_installed_once():
    install = load(ROOT).build()
    for path in sorted((ROOT / "supabase/strava").glob("*.sql")):
        expected = 0 if path.name in ("base.sql", "preflight.sql") else 1
        assert install.count("-- strava/" + path.name + "\n") == expected, path.name
