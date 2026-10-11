"""A completed synthetic Cursor composer is captured once, then deduped by composer id."""
import json
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor

from agentgrinder import hook


COMPOSER = "aaaaaaaa-0000-0000-0000-000000000001"


def store(tmp_path):
    path = tmp_path / "state.vscdb"
    db = sqlite3.connect(path)
    db.execute("create table cursorDiskKV(key text primary key,value blob)")
    db.execute("create table composerHeaders(composerId text primary key,isSubagent integer)")
    db.execute(
        "insert into cursorDiskKV values(?,?)",
        ("composerData:" + COMPOSER, json.dumps({
            "composerId": COMPOSER,
            "status": "completed",
            "lastUpdatedAt": 1789480800000,
            "name": "PRIVATE MESSAGE TEXT",
        })),
    )
    db.execute("insert into composerHeaders values(?,0)", (COMPOSER,))
    db.commit()
    db.close()
    return path


def test_finished_composer_captures_exactly_once(tmp_path, monkeypatch):
    source = store(tmp_path)
    captured = []
    opened = []
    monkeypatch.setattr(
        hook, "_store_private",
        lambda root, composer_id, run: captured.append(composer_id) or f"{composer_id}.html",
    )
    monkeypatch.setattr(hook, "_ensure_server", lambda root, port: None)
    capture = lambda composer_id: {
        "composer_id": composer_id,
        "ridge": [0] * 50,
        "ridge_basis": "call-index",
        "worker_bins": [0] * 50,
        "commit_bins": [],
    }
    first = hook.run_once(
        tmp_path / "private", source, capture_one=capture, open_one=opened.append)
    second = hook.run_once(
        tmp_path / "private", source, capture_one=capture, open_one=opened.append)
    assert first == {"captured": 1, "composer_ids": [COMPOSER],
                     "preview": f"http://127.0.0.1:8765/{COMPOSER}.html"}
    assert second == {"captured": 0, "composer_ids": []}
    assert captured == [COMPOSER]
    assert opened == [f"http://127.0.0.1:8765/{COMPOSER}.html"]


def test_completed_composer_without_typed_request_does_not_block_next_one(tmp_path, monkeypatch):
    source = store(tmp_path)
    later = "bbbbbbbb-0000-0000-0000-000000000002"
    with sqlite3.connect(source) as db:
        db.execute("insert into cursorDiskKV values(?,?)", (
            "composerData:" + later,
            json.dumps({"status": "completed", "lastUpdatedAt": 1789480800001}),
        ))
        db.execute("insert into composerHeaders values(?,0)", (later,))
    seen = []
    monkeypatch.setattr(hook, "_store_private", lambda _root, composer_id, _run: f"{composer_id}.html")
    monkeypatch.setattr(hook, "_ensure_server", lambda *_args: None)

    def capture(composer_id):
        seen.append(composer_id)
        if composer_id == COMPOSER:
            raise ValueError("no typed <user_query> turns in completed transcript")
        return {"composer_id": composer_id}

    first = hook.run_once(tmp_path / "private", source, capture_one=capture)
    second = hook.run_once(tmp_path / "private", source, capture_one=capture)
    assert first["composer_ids"] == [later]
    assert second == {"captured": 0, "composer_ids": []}
    assert seen == [COMPOSER, later]


def test_subagent_and_unfinished_composers_are_not_captured(tmp_path):
    source = store(tmp_path)
    db = sqlite3.connect(source)
    db.execute(
        "insert into cursorDiskKV values(?,?)",
        ("composerData:worker", json.dumps({
            "status": "completed",
        })),
    )
    db.execute("insert into composerHeaders values('worker',1)")
    db.execute(
        "insert into cursorDiskKV values(?,?)",
        ("composerData:active", json.dumps({"status": "running"})),
    )
    db.commit()
    db.close()
    with hook.cursor_tree.CopiedDb(source) as copied:
        assert hook.finished_composers(copied) == [COMPOSER]


def test_automatic_capture_drops_message_and_path_derived_fields(tmp_path, monkeypatch):
    from agentgrinder import ingest
    transcript = tmp_path / "session.jsonl"
    transcript.write_text("{}\n")
    monkeypatch.setattr(hook, "_transcript", lambda _composer_id: transcript)
    monkeypatch.setattr(ingest, "parse_cursor_session", lambda _path, **_kwargs: {
        "title": "Safe title",
        "private_title_prompt": "PRIVATE MESSAGE",
        "route_legend": ["private-folder"],
    })
    run = hook._capture(COMPOSER)
    assert run == {"title": "Safe title", "composer_id": COMPOSER}


def test_automatic_capture_passes_custom_database_to_ridge_reader(tmp_path, monkeypatch):
    from agentgrinder import ingest
    transcript = tmp_path / "session.jsonl"
    transcript.write_text("{}\n")
    selected = tmp_path / "custom.vscdb"
    observed = []
    monkeypatch.setattr(hook, "_transcript", lambda _composer_id: transcript)
    monkeypatch.setattr(
        ingest, "parse_cursor_session",
        lambda _path, cursor_db=None, **_kwargs: observed.append(cursor_db) or {},
    )
    hook._capture(COMPOSER, selected)
    assert observed == [selected]


def test_concurrent_timer_runs_claim_composer_once(tmp_path, monkeypatch):
    source = store(tmp_path)
    root = tmp_path / "private"
    state = hook._state(hook._root(root))
    state.close()
    captures = []
    monkeypatch.setattr(hook, "_store_private", lambda *_args: f"{COMPOSER}.html")
    monkeypatch.setattr(hook, "_ensure_server", lambda *_args: None)

    def capture(composer_id):
        captures.append(composer_id)
        time.sleep(0.05)
        return {"composer_id": composer_id}

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(
            lambda _: hook.run_once(root, source, capture_one=capture, open_one=lambda _url: None),
            range(2),
        ))
    assert sum(result["captured"] for result in results) == 1
    assert captures == [COMPOSER]


def test_custom_database_is_kept_in_scheduled_command(tmp_path):
    command = hook._command(tmp_path / "private", 8765, db=tmp_path / "custom.vscdb")
    assert command[-2:] == ["--db", str(tmp_path / "custom.vscdb")]


def test_a_capture_opens_no_browser_unless_asked(tmp_path, monkeypatch):
    """Oscar's ruling, 24 Sep 2026: no surprise windows. The scheduled hook writes the loopback
    URL to its output and opens nothing unless it was installed or run with --open."""
    source = store(tmp_path)
    monkeypatch.setattr(hook, "_store_private", lambda root, composer_id, run: f"{composer_id}.html")
    monkeypatch.setattr(hook, "_ensure_server", lambda root, port: None)

    def no_window(*_a, **_k):
        raise AssertionError("the hook opened a browser without --open")
    monkeypatch.setattr(hook.webbrowser, "open", no_window)
    capture = lambda composer_id: {"composer_id": composer_id, "ridge": [0] * 50}
    result = hook.run_once(tmp_path / "private", source, capture_one=capture)
    assert result["captured"] == 1
    assert result["preview"] == f"http://127.0.0.1:8765/{COMPOSER}.html"


def test_install_command_carries_open_only_when_asked(tmp_path):
    assert "--open" not in hook._command(tmp_path, 8765, "run")
    assert "--open" not in hook._command(tmp_path, 8765, "watch")
    assert hook._command(tmp_path, 8765, "run", open_preview=True)[-1] == "--open"
