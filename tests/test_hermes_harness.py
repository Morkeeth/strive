"""Hermes Agent sessions, read from a synthetic state.db built with Hermes's own table definitions.

Every private column carries a sentinel string. The reader must never let one reach a run, an
export payload or a rendered card. No real Hermes messages are used anywhere in this file.
"""
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agentgrinder import cli, hermes, ingest
from agentgrinder.push import export_run

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DDL = os.path.join(REPO, "tests", "fixtures", "hermes_state_ddl.sql")
SENTINEL = "SENTINEL_PRIVATE_7f3a"
T0 = 1_762_900_000.0


def _db(path, rows=True):
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(open(DDL).read())
    if rows:
        _fill(conn)
    conn.commit()
    return conn


def _session(conn, sid, source, started, model_config=None):
    conn.execute(
        "INSERT INTO sessions (id, source, started_at, model_config, title, display_name, user_id,"
        " chat_id, origin_json, system_prompt) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (sid, source, started, model_config, SENTINEL + " title", SENTINEL + " name",
         SENTINEL + " user", SENTINEL + " chat", json.dumps({"x": SENTINEL}), SENTINEL + " prompt"),
    )


def _msg(conn, sid, role, ts, content=None, tool_calls=None, **flags):
    cols = {"session_id": sid, "role": role, "timestamp": ts,
            "content": content if content is not None else SENTINEL + " content",
            "tool_calls": json.dumps(tool_calls) if tool_calls is not None else None,
            "reasoning": SENTINEL + " reasoning", "api_content": SENTINEL + " api"}
    cols.update(flags)
    conn.execute(f"INSERT INTO messages ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                 tuple(cols.values()))


def _call(name):
    return {"id": "c", "type": "function",
            "function": {"name": name, "arguments": json.dumps({"cmd": SENTINEL + " args"})}}


def _fill(conn):
    # A: a person typed two turns. Everything else in A is not a typed turn.
    _session(conn, "A", "telegram", T0)
    _msg(conn, "A", "user", T0 + 0)
    _msg(conn, "A", "assistant", T0 + 10, tool_calls=[_call("terminal"), _call("web_search")])
    _msg(conn, "A", "tool", T0 + 11, tool_name="terminal")
    _msg(conn, "A", "user", T0 + 20, observed=1)                     # seen in a group, not addressed
    _msg(conn, "A", "user", T0 + 30, _compressed_summary=1)          # Hermes's own summary
    _msg(conn, "A", "user", T0 + 40, content="[Cron delivery: daily]\n" + SENTINEL)  # mirrored job
    _msg(conn, "A", "user", T0 + 50, active=0)                       # retired row
    _msg(conn, "A", "user", T0 + 100)
    _msg(conn, "A", "assistant", T0 + 200, tool_calls=[_call("execute_code")])
    # B: a scheduled run. C: a delegated sub-agent. D: an API caller. None has a typed turn.
    _session(conn, "B", "cron", T0 + 1000)
    _msg(conn, "B", "user", T0 + 1000)
    _session(conn, "C", "cli", T0 + 2000, model_config=json.dumps({"_delegate_from": "A"}))
    _msg(conn, "C", "user", T0 + 2000)
    _session(conn, "D", "api_server", T0 + 3000)
    _msg(conn, "D", "user", T0 + 3000)


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "state.db")
    _db(path).close()
    return path


def test_only_sessions_a_person_typed_in_are_sittings(db):
    groups = hermes.sessions(db)
    assert [g["session_id"] for g in groups] == ["A"]


def test_counts_turns_tools_and_wall_time_from_the_rows(db):
    run = hermes.parse_hermes_session(db)
    assert run["harness"] == "Hermes"
    assert run["turns_typed"] == 2
    assert run["tool_calls"] == 3
    assert run["shell_calls"] == 2          # terminal and execute_code
    assert run["duration_s"] == 200
    assert run["files_touched"] is None and run["commits"] is None


def test_no_private_text_reaches_the_run_the_export_or_the_card(db, tmp_path, capsys):
    run = hermes.parse_hermes_session(db)
    assert SENTINEL not in json.dumps(run, default=str)
    assert SENTINEL not in json.dumps(export_run(run))
    out = tmp_path / "card.html"
    code = cli.main(["grind", db, "--harness", "hermes", "--no-open", "--no-rank",
                     "--no-series", "-o", str(out)])
    assert code == 0
    printed = capsys.readouterr()
    assert SENTINEL not in out.read_text()
    assert SENTINEL not in printed.out + printed.err


def test_reading_never_changes_the_database_files(db):
    def digest():
        h = hashlib.sha256()
        for suffix in ("", "-wal"):
            if os.path.exists(db + suffix):
                h.update(open(db + suffix, "rb").read())
        return h.hexdigest()
    before = digest()
    hermes.parse_hermes_session(db)
    hermes.digest(db)
    assert digest() == before


def test_rows_still_in_the_wal_are_read(tmp_path):
    path = str(tmp_path / "state.db")
    writer = _db(path, rows=False)
    writer.execute("PRAGMA wal_autocheckpoint=0")
    _session(writer, "W", "cli", T0)
    _msg(writer, "W", "user", T0)
    writer.commit()                      # committed, not checkpointed into the main file
    assert os.path.getsize(path + "-wal") > 0
    try:
        assert [g["session_id"] for g in hermes.sessions(path)] == ["W"]
    finally:
        writer.close()


def test_the_row_digest_moves_when_a_row_lands_and_holds_otherwise(db):
    first = hermes.digest(db)
    assert hermes.digest(db) == first
    conn = sqlite3.connect(db)
    _msg(conn, "A", "assistant", T0 + 300, tool_calls=[_call("terminal")])
    conn.commit(); conn.close()
    assert hermes.digest(db) != first


def test_an_empty_store_says_so_instead_of_drawing_a_card(tmp_path, capsys):
    path = str(tmp_path / "state.db")
    _db(path, rows=False).close()
    assert hermes.sessions(path) == []
    with pytest.raises(ValueError):
        hermes.parse_hermes_session(path)
    assert cli.main(["grind", path, "--harness", "hermes", "--no-open", "--no-rank"]) == 1


def test_a_database_that_is_not_hermes_is_refused_by_name(tmp_path):
    path = str(tmp_path / "other.db")
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE sessions (id TEXT)")
    conn.execute("CREATE TABLE messages (id INTEGER)")
    conn.commit(); conn.close()
    with pytest.raises(ValueError, match="Missing"):
        hermes.sessions(path)


def test_auto_reads_a_sqlite_file_as_hermes(db, tmp_path, capsys):
    out = tmp_path / "card.html"
    assert cli.main(["grind", db, "--no-open", "--no-rank", "--no-series", "-o", str(out)]) == 0
    assert "Hermes" in capsys.readouterr().out


def test_every_command_that_offers_hermes_runs_with_it(db, tmp_path, monkeypatch, capsys):
    home = tmp_path / "home"
    (home / ".hermes").mkdir(parents=True)
    shutil.copy(db, home / ".hermes" / "state.db")
    for suffix in ("-wal", "-shm"):
        if os.path.exists(db + suffix):
            shutil.copy(db + suffix, str(home / ".hermes" / "state.db") + suffix)
    monkeypatch.setenv("HOME", str(home))
    assert ingest.latest_hermes_session() == str(home / ".hermes" / "state.db")
    assert cli.main(["grind", "--harness", "hermes", "--list"]) == 0
    assert "--pick 1" in capsys.readouterr().out
    assert cli.main(["grind", "--harness", "hermes", "--no-open", "--no-rank", "--no-series",
                     "-o", str(tmp_path / "g.html")]) == 0
    assert cli.main(["v1card", "--harness", "hermes", "--no-open",
                     "-o", str(tmp_path / "v1.html")]) == 0
    capsys.readouterr()
    assert cli.main(["a2a", "export", "--harness", "hermes"]) == 0
    exported = capsys.readouterr().out
    assert SENTINEL not in exported
    assert '"harness": "hermes"' in exported
    assert json.loads(exported)["source"]["ingest"] == "native-hermes-sqlite"


def test_the_web_app_names_hermes_and_draws_a_mark():
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed")
    script = ("const a=require(process.argv[1]);"
              "const h=a.agent('Hermes'),k=a.agent('hermes-agent');"
              "if(h.name!=='Hermes'||h.maker!=='hermes'||k.name!=='Hermes')process.exit(2);"
              "if(!a.markSvg('hermes').includes('<path'))process.exit(3);")
    result = subprocess.run([node, "-e", script, os.path.join(REPO, "site", "agent-names.js")],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_a_missing_store_is_never_created_by_reading_it(tmp_path):
    path = str(tmp_path / "absent" / "state.db")
    os.makedirs(os.path.dirname(path))
    with pytest.raises(sqlite3.OperationalError):
        hermes.sessions(path)
    assert not os.path.exists(path)
