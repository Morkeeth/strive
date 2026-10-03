"""The advertised one-liner must find whatever harness the person actually uses.

The defect this file pins (3 Sep 2026): `--harness` defaulted to `claude`, so on a Cursor-only
or Codex-only machine the README's and the website's own `grind` exited 1 with "no Claude Code
session with a human turn under ~/.claude/projects" — a wall that never mentioned that either
other harness was supported. The pitch page promises Claude, Cursor and Codex.

Second defect pinned here: the auto not-found message said "no Claude or Cursor session found on
this machine" and named no path, while the code beside it already handled Codex. A message that
names no object cannot be checked by the person reading it.

Every test runs the real CLI in a subprocess against a fixture HOME, so it measures the shipped
default and not an import.
"""
import json
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CURSOR_LINES = (
    '{"role":"user","message":{"content":"<timestamp>Wednesday, Sep 03, 2026, 10:00 AM</timestamp>'
    '<user_query>build the thing</user_query>"}}\n'
    '{"role":"assistant","message":{"content":[{"type":"tool_use"},{"type":"text","text":"ok"}]}}\n'
    '{"role":"user","message":{"content":"<timestamp>Wednesday, Sep 03, 2026, 10:30 AM</timestamp>'
    '<user_query>now test it</user_query>"}}\n'
)
CODEX_LINES = (
    '{"type":"session_meta","payload":{"cwd":"/Users/alice/code/myapp"}}\n'
    '{"type":"event_msg","timestamp":"2026-09-03T10:01:00Z","payload":{"type":"user_message","message":"build the thing"}}\n'
    '{"type":"response_item","timestamp":"2026-09-03T10:02:00Z","payload":{"type":"function_call","name":"test","call_id":"fixture-call"}}\n'
)


def cursor_home(tmp_path):
    d = tmp_path / ".cursor" / "projects" / "Users-alice-code-myapp" / "agent-transcripts" / "aaaa"
    d.mkdir(parents=True)
    (d / "t.jsonl").write_text(CURSOR_LINES, encoding="utf-8")
    return tmp_path


def codex_home(tmp_path):
    d = tmp_path / ".codex" / "sessions" / "2026" / "09" / "03"
    d.mkdir(parents=True)
    (d / "rollout-x.jsonl").write_text(CODEX_LINES, encoding="utf-8")
    return tmp_path


def run_grind(home, tmp_path, *extra):
    env = dict(os.environ, HOME=str(home),
               AGENTGRINDER_SERIES=str(tmp_path / "series.db"))   # never the real series
    return subprocess.run(
        [sys.executable, "-m", "agentgrinder", "grind", "--no-open",
         "-o", str(tmp_path / "card.html"), *extra],
        cwd=REPO, capture_output=True, text=True, env=env)


def test_the_default_is_auto_not_claude():
    """Read the parser itself, so the default cannot drift back without this going red."""
    src = open(os.path.join(REPO, "agentgrinder", "cli.py"), encoding="utf-8").read()
    line = [l for l in src.splitlines() if 'g.add_argument("--harness"' in l][0]
    assert 'default="auto"' in line, line


def test_a_cursor_only_machine_gets_a_card_from_the_advertised_one_liner(tmp_path):
    proc = run_grind(cursor_home(tmp_path / "home"), tmp_path)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "auto -> cursor" in proc.stderr
    assert (tmp_path / "card.html").exists()


def test_cursor_list_identifies_project_source_and_sittings(tmp_path):
    home = cursor_home(tmp_path / "home")
    proc = run_grind(home, tmp_path, str(next(home.glob(".cursor/projects/*/agent-transcripts/*/*.jsonl"))), "--harness", "cursor", "--list", "--show-paths")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    receipt = json.loads(proc.stdout)
    assert receipt[0]["selected_session"]["harness"] == "cursor"
    assert receipt[0]["selected_session"]["project"] == "code-myapp"
    assert receipt[0]["selected_session"]["source"].endswith("/t.jsonl")
    assert receipt[0]["selected_session"]["source_path_hidden"] is False
    assert [row["sitting"] for row in receipt] == [1]
    assert "rerun with --pick N" in receipt[0]["next"]


def test_a_codex_only_machine_gets_a_card_from_the_advertised_one_liner(tmp_path):
    proc = run_grind(codex_home(tmp_path / "home"), tmp_path)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "auto -> codex" in proc.stderr
    assert (tmp_path / "card.html").exists()


def test_nothing_anywhere_names_every_path_it_searched(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    proc = run_grind(home, tmp_path)
    assert proc.returncode == 1
    for path in ("~/.claude/projects/*/*.jsonl",
                 "~/.cursor/projects/*/agent-transcripts/*/*.jsonl",
                 "~/.codex/sessions/**/*.jsonl",
                 "~/.codex/archived_sessions/*.jsonl"):
        assert path in proc.stdout, path
    assert "python3 -m agentgrinder demo" in proc.stdout   # the next step survives


def test_every_harness_flag_that_takes_a_choice_knows_codex_exists():
    """`vibe`, `a2a export` and `card` each omitted codex while the CLI accepted it elsewhere."""
    src = open(os.path.join(REPO, "agentgrinder", "cli.py"), encoding="utf-8").read()
    for line in src.splitlines():
        if '--harness"' in line and "choices=" in line:
            assert '"codex"' in line, line


def test_asking_for_claude_explicitly_still_reads_claude(tmp_path):
    """The default changed; the explicit path must not have."""
    home = tmp_path / "home"
    proj = home / ".claude" / "projects" / "-Users-alice-code-myapp"
    proj.mkdir(parents=True)
    sample = open(os.path.join(REPO, "samples", "sample_session.jsonl"), encoding="utf-8").read()
    (proj / "x.jsonl").write_text(sample, encoding="utf-8")
    explicit = run_grind(home, tmp_path, "--harness", "claude", "--json")
    auto = run_grind(home, tmp_path, "--json")
    assert explicit.returncode == 0 and auto.returncode == 0, explicit.stderr + auto.stderr
    a = json.loads(auto.stdout[auto.stdout.index("{"):])
    e = json.loads(explicit.stdout[explicit.stdout.index("{"):])
    # auto must pick the same SITTING as the explicit claude path, not silently switch to the last
    for k in ("turns_typed", "tool_calls", "files_touched", "commits", "started", "ended"):
        assert a[k] == e[k], k


def test_cursor_discovery_lists_all_sources_without_reading_bodies(tmp_path):
    home = cursor_home(tmp_path / "home")
    older = next(home.glob(".cursor/projects/*/agent-transcripts/*/*.jsonl"))
    newer = home / ".cursor/projects/Users-alice-code-other/agent-transcripts/bbbb/t.jsonl"
    newer.parent.mkdir(parents=True)
    # Discovery must not parse content, even an invalid transcript is a selectable file.
    newer.write_text("PRIVATE_CANARY not valid JSON")
    os.utime(older, (100,100)); os.utime(newer, (200,200))
    proc = run_grind(home, tmp_path, "--harness", "cursor", "--list", "--show-paths")
    assert proc.returncode == 0, proc.stderr
    result = json.loads(proc.stdout)
    assert result["kind"] == "cursor-transcript-candidates"
    assert [r["source"] for r in result["candidates"]] == [str(newer), str(older)]
    assert {r["project"] for r in result["candidates"]} == {"code-other", "code-myapp"}
    assert "PRIVATE_CANARY" not in proc.stdout
    assert "--list" in result["next"] and "exact" in result["next"]
    hidden = run_grind(home, tmp_path, "--harness", "cursor", "--list")
    assert str(home) not in hidden.stdout
    assert "--show-paths" in json.loads(hidden.stdout)["next"]
    assert not (tmp_path / "card.html").exists()
