"""Automatic fetch (agentgrinder sync): finished sessions become private drafts, once each."""
import io
import json
import os
import re
import shutil
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture()
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("STRIVE_HOME", str(tmp_path / ".strive"))
    monkeypatch.setenv("STRIVE_TRUSTED_HOSTS", "strive.test")
    import importlib
    from agentgrinder import sync
    importlib.reload(sync)
    codex = tmp_path / ".codex" / "sessions" / "2026" / "09" / "24"
    codex.mkdir(parents=True)
    target = codex / "rollout-2026-09-24T10-00-00-test.jsonl"
    shutil.copy(ROOT / "samples/dropin/codex-desktop.jsonl", target)
    old = time.time() - 3600
    os.utime(target, (old, old))
    return tmp_path, sync, target


class Opener:
    def __init__(self):
        self.requests = []

    def __call__(self, request, timeout=30):
        self.requests.append(request)
        body = json.dumps({"id": "11111111-1111-1111-1111-111111111111", "visibility": "private", "existing": False})
        return io.BytesIO(body.encode())


def test_payload_for_records_a_measurement_revision_for_a_claude_session(tmp_path, monkeypatch):
    monkeypatch.setenv("STRIVE_HOME", str(tmp_path / ".strive"))
    import importlib
    from agentgrinder import sync
    sync = importlib.reload(sync)
    target = tmp_path / "claude.jsonl"
    shutil.copy(ROOT / "samples/dropin/claude-edge.jsonl", target)

    payload = sync.payload_for("claude", str(target), pick=1)

    assert re.fullmatch(r"[0-9a-f]{64}", payload["measurement_revision"])


def test_a_finished_session_is_sent_once_as_a_private_run_with_counts_only(home):
    tmp, sync, target = home
    found = sync.discover()
    assert ("codex", str(target)) in found
    # The first sync only records the idle file; the next one sends it if it did not move.
    first = Opener()
    counts = sync.sync_once("ag_test", site="https://strive.test", opener=first, out=lambda *_: None)
    assert counts["waiting"] == 1 and counts["sent"] == 0 and not first.requests
    opener = Opener()
    counts = sync.sync_once("ag_test", site="https://strive.test", opener=opener, out=lambda *_: None)
    assert counts["sent"] == 1 and counts["failed"] == 0
    req = opener.requests[0]
    assert req.full_url == "https://strive.test/api/agent/runs"
    assert req.get_header("Authorization") == "Bearer ag_test"
    payload = json.loads(req.data)
    assert payload["visibility"] == "private"
    assert "title" not in payload or payload["title"] in (None, "")
    blob = json.dumps(payload)
    for probe in (str(tmp), "PROMPT-SENTINEL", "/Users/", ".jsonl"):
        assert probe not in blob, probe
    # Second run: nothing new is sent, and the state file holds no paths.
    again = Opener()
    counts = sync.sync_once("ag_test", site="https://strive.test", opener=again, out=lambda *_: None)
    assert counts["sent"] == 0 and counts["already"] == 1 and not again.requests
    state = (tmp / ".strive" / "synced.json").read_text()
    assert str(target) not in state and "codex" not in state


def test_a_resumed_session_keeps_its_key_and_is_not_sent_twice(home):
    _, sync, target = home
    k1 = sync.idempotency_key(sync.sitting_key(sync.file_key("codex", str(target)), 1))
    for _ in range(2):
        sync.sync_once("ag_test", site="https://strive.test", opener=Opener(), out=lambda *_: None)
    with open(target, "a") as f:
        f.write("\n")
    old = time.time() - 3000
    os.utime(target, (old, old))
    assert k1 == sync.idempotency_key(sync.sitting_key(sync.file_key("codex", str(target)), 1))
    # The file moved, so it waits one sync and is then read again for NEW sittings. The sitting
    # already sent is never sent again.
    for expected in ({"waiting": 1}, {"already": 1}):
        again = Opener()
        counts = sync.sync_once("ag_test", site="https://strive.test", opener=again, out=lambda *_: None)
        assert not again.requests and all(counts[k] == v for k, v in expected.items()), counts


def test_a_file_that_moved_between_syncs_waits_again(home):
    _, sync, target = home
    sync.sync_once("ag_test", site="https://strive.test", opener=Opener(), out=lambda *_: None)
    with open(target, "a") as f:
        f.write("\n")
    old = time.time() - 3000
    os.utime(target, (old, old))
    opener = Opener()
    counts = sync.sync_once("ag_test", site="https://strive.test", opener=opener, out=lambda *_: None)
    assert counts["waiting"] == 1 and not opener.requests


def test_a_session_still_being_written_waits(home):
    _, sync, target = home
    os.utime(target, None)   # just modified
    assert ("codex", str(target)) not in sync.discover()


def test_the_token_file_is_private_and_a_dry_run_sends_nothing(home):
    tmp, sync, _ = home
    path = sync.save_token("ag_secret")
    assert oct(path.stat().st_mode & 0o777) == "0o600"
    assert sync.read_token() == "ag_secret"
    opener = Opener()
    lines = []
    counts = sync.sync_once("ag_secret", dry_run=True, opener=opener, out=lines.append)
    assert counts["sent"] == 1 and not opener.requests and lines
    assert not (tmp / ".strive" / "synced.json").exists()


def test_the_cli_knows_sync():
    from agentgrinder.cli import main
    with pytest.raises(SystemExit) as out:
        main(["sync", "--help"])
    assert out.value.code == 0


def _twice(sync, opener, lines):
    sync.sync_once("ag_test", site="https://strive.test", opener=Opener(), out=lambda *_: None)
    return sync.sync_once("ag_test", site="https://strive.test", opener=opener, out=lines.append)


def test_only_a_confirmed_private_run_counts_as_sent(home):
    tmp, sync, _ = home
    for body in ({"id": "x", "visibility": "public"}, {"visibility": "private"}, ["nope"]):
        def opener(request, timeout=30, body=body):
            return io.BytesIO(json.dumps(body).encode())
        (tmp / ".strive" / "synced.json").unlink(missing_ok=True)
        lines = []
        counts = _twice(sync, opener, lines)
        assert counts["sent"] == 0 and counts["failed"] == 1
        assert '"sent"' not in (tmp / ".strive" / "synced.json").read_text()


def test_server_error_text_is_never_printed(home):
    import urllib.error
    _, sync, _ = home
    def opener(request, timeout=30):
        raise urllib.error.HTTPError(request.full_url, 400, "bad", {}, io.BytesIO(b'{"error":"SERVER-SENTINEL"}'))
    lines = []
    counts = _twice(sync, opener, lines)
    assert counts["failed"] == 1 and lines and not any("SERVER-SENTINEL" in line for line in lines)


def test_the_token_only_goes_to_a_trusted_https_host(home):
    _, sync, _ = home
    for site in ("http://strive.test", "https://evil.test", "https://strive.test.evil.test"):
        opener = Opener()
        lines = []
        sync.sync_once("ag_test", site=site, opener=Opener(), out=lambda *_: None)
        counts = sync.sync_once("ag_test", site=site, opener=opener, out=lines.append)
        assert not opener.requests and counts["failed"] == 1, site
    assert sync.check_site("https://agentic-strava.vercel.app/") == "https://agentic-strava.vercel.app"


def test_redirects_are_refused(home):
    _, sync, _ = home
    assert sync._NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://evil.test") is None


def test_a_dry_run_cannot_install(home, capsys):
    from agentgrinder.cli import main
    code = main(["sync", "--dry-run", "--install"])
    assert code == 1 and "cannot install" in capsys.readouterr().out


# Sittings: a long-lived session file is many runs. Eric gate step 2 (day-run/2026-10-01/STRIVE-ERIC-GATE.md).
def _shift(rows, hours):
    from datetime import datetime, timedelta
    out = []
    for row in rows:
        row = dict(row)
        stamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")) + timedelta(hours=hours)
        row["timestamp"] = stamp.isoformat().replace("+00:00", "Z")
        out.append(row)
    return out


def _add_sitting(target, hours):
    """Append the sample's last two turns again, `hours` later: a new sitting after a long idle gap."""
    rows = [json.loads(line) for line in (ROOT / "samples/dropin/codex-desktop.jsonl").read_text().splitlines() if line.strip()]
    with open(target, "a") as stream:
        for row in _shift(rows[6:], hours):
            stream.write(json.dumps(row) + "\n")


def _idle(target, seconds):
    old = time.time() - seconds
    os.utime(target, (old, old))


def _keys(opener):
    return [request.get_header("Idempotency-key") for request in opener.requests]


def test_each_sitting_in_one_file_is_its_own_private_run(home):
    _, sync, target = home
    _add_sitting(target, 2)
    _idle(target, 3600)
    sync.sync_once("ag_test", site="https://strive.test", opener=Opener(), out=lambda *_: None)
    opener = Opener()
    counts = sync.sync_once("ag_test", site="https://strive.test", opener=opener, out=lambda *_: None)
    assert counts["sent"] == 2 and len(set(_keys(opener))) == 2
    # Each run measures its own sitting, not the whole file.
    turns = [json.loads(request.data).get("turns_typed") for request in opener.requests]
    assert all(t is not None and t < 6 for t in turns), turns


def test_a_resumed_file_sends_only_the_new_sitting(home):
    _, sync, target = home
    for _ in range(2):
        sync.sync_once("ag_test", site="https://strive.test", opener=Opener(), out=lambda *_: None)
    _add_sitting(target, 2)
    _idle(target, 3600)
    sync.sync_once("ag_test", site="https://strive.test", opener=Opener(), out=lambda *_: None)
    opener = Opener()
    counts = sync.sync_once("ag_test", site="https://strive.test", opener=opener, out=lambda *_: None)
    assert counts["sent"] == 1 and counts["already"] == 1 and len(opener.requests) == 1


def test_the_last_sitting_waits_until_the_split_gap_has_passed(home):
    _, sync, target = home
    _add_sitting(target, 2)
    _idle(target, 15 * 60)   # idle long enough to be seen, not long enough to close the sitting
    sync.sync_once("ag_test", site="https://strive.test", opener=Opener(), out=lambda *_: None)
    opener = Opener()
    counts = sync.sync_once("ag_test", site="https://strive.test", opener=opener, out=lambda *_: None)
    assert counts["sent"] == 1 and counts["waiting"] == 1   # the closed first sitting goes, the open one waits
    state = (target.parents[5] / ".strive" / "synced.json").read_text()
    assert str(target) not in state and "codex" not in state
