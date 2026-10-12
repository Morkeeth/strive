"""THE COMMAND THE PAGE HANDS OUT HAS TO WORK FOR THE TOOLS THE PAGE PROMISES.

Launch audit of production 7858535: the home page says it reads Cursor, Grok Bot, Claude Code
and Codex, and the command under the Copy button was `grind --harness cursor`. A Claude Code or
Codex user who copied it got one line — `no Cursor session under ~/.cursor/projects/...` — and
exit 1. No next step, and no hint that the tool they actually use is supported. The reader knew
the answer; the message did not say it.

So: the copied command is `--harness auto`, and every miss names the four tools and shows how to
point at one file. Both halves fail on the old head.
"""
from pathlib import Path
import json
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
README = (ROOT / "README.md").read_text()


def _grind(tmp_home: Path, *args) -> subprocess.CompletedProcess:
    env = {**os.environ, "HOME": str(tmp_home), "USERPROFILE": str(tmp_home),
           "AGENTGRINDER_NO_GH": "1", "AGENTGRINDER_SERIES": str(tmp_home / "series.db")}
    env.pop("AGENTGRINDER_CURSOR_CHATS", None)
    return subprocess.run([sys.executable, "-m", "agentgrinder", "grind", *args],
                          cwd=ROOT, env=env, capture_output=True, text=True)


def _claude_transcript(home: Path) -> Path:
    """A real Claude Code transcript where Claude Code keeps them, with one typed turn."""
    project = home / "code" / "demo"
    project.mkdir(parents=True)
    (project / "made.md").write_text("x")
    folder = home / ".claude" / "projects" / "-Users-someone-code-demo"
    folder.mkdir(parents=True)
    def record(kind, content, stamp, **extra):
        row = {"type": kind, "timestamp": stamp, "cwd": str(project),
               "message": {"role": kind, "content": content}}
        row.update(extra)
        return json.dumps(row)
    lines = [
        record("user", "add the parser", "2026-09-22T10:00:00Z", promptSource="typed"),
        record("assistant", [{"type": "tool_use", "name": "Write",
                              "input": {"file_path": str(project / "made.md")}}],
               "2026-09-22T10:00:10Z"),
        record("assistant", [{"type": "text", "text": "Done."}], "2026-09-22T10:00:30Z"),
    ]
    transcript = folder / "session.jsonl"
    transcript.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return transcript


# ---- the copied command ---------------------------------------------------------------------

def test_the_capture_commands_offer_deliberate_native_session_selection():
    # Native pickers support these three readers; imported Grok Bot uses the file path.
    assert "strive sessions --all --open --site __ORIGIN__" in INDEX
    assert "strive sessions --harness ${h} --open --site __ORIGIN__" in INDEX
    assert "['cursor','claude','codex'].map(h=>[h,picker(h)])" in INDEX
    assert "agentgrinder grind --harness auto" in INDEX  # Advanced legacy import still exists.
    assert "uvx --from __CAPTURE_PACKAGE__" in INDEX
    assert "striverun.app/?post" in README


def test_the_page_promises_exactly_the_tools_the_reader_supports():
    """The mismatch the audit found was between a promise and a command, so bind them."""
    from agentgrinder.ingest import HARNESSES
    assert "reads the freshest Cursor, Claude Code, Codex or imported Grok Bot session" in INDEX
    for tool in HARNESSES.values():
        assert tool in INDEX, tool
    assert "striverun.app/?post" in README
    assert "session" in README and "privately" in README


def test_auto_makes_a_card_from_a_claude_code_session(tmp_path):
    """The claim under the change: the command the page now hands out works for a tool that is
    not Cursor. This one passes on the old head too — `auto` always worked. What did not work
    was the command the page printed, which the two tests above pin."""
    _claude_transcript(tmp_path)
    out = tmp_path / "grind.html"
    done = _grind(tmp_path, "--harness", "auto", "--no-open", "--no-series",
                  "--no-rank", "-o", str(out))
    assert done.returncode == 0, done.stdout + done.stderr
    assert "auto -> claude" in done.stderr
    card = out.read_text()
    assert out.is_file() and "<html" in card
    assert "Claude Code" in card               # the card names the harness it read
    assert "1 file changed in demo" in done.stdout


def test_codex_desktop_response_items_split_into_real_sittings(tmp_path):
    """The current Codex app has response_item/message turns, not event_msg/user_message."""
    from agentgrinder.native_sittings import sittings

    transcript = tmp_path / "rollout.jsonl"
    rows = [
        {"timestamp": "2026-10-01T10:00:00Z", "type": "session_meta",
         "payload": {"cwd": str(tmp_path), "source": "user"}},
        {"timestamp": "2026-10-01T10:00:01Z", "type": "response_item",
         "payload": {"type": "message", "role": "user",
                     "content": [{"type": "input_text", "text": "repair the card"}]}},
        {"timestamp": "2026-10-01T10:00:02Z", "type": "response_item",
         "payload": {"type": "function_call", "call_id": "call-1", "name": "exec", "arguments": "{}"}},
        {"timestamp": "2026-10-01T11:00:00Z", "type": "response_item",
         "payload": {"type": "message", "role": "user",
                     "content": [{"type": "input_text", "text": "verify the repair"}]}},
    ]
    transcript.write_text("\n".join(json.dumps(row) for row in rows) + "\n")
    groups = sittings(str(transcript), "codex", gap=1800)
    assert len(groups) == 2
    assert any((row.get("payload") or {}).get("call_id") == "call-1" for row in groups[0])


# ---- the next step when there is nothing to read ---------------------------------------------

def test_every_empty_handed_miss_names_the_tools_and_how_to_point_at_one(tmp_path):
    for harness in ("auto", "cursor", "claude", "codex", "grokbot"):
        home = tmp_path / harness
        home.mkdir()
        done = _grind(home, "--harness", harness, "--no-open", "--no-series")
        assert done.returncode == 1, harness
        text = done.stdout
        for tool in ("Cursor", "Claude Code", "Codex", "Grok Bot"):
            assert tool in text, (harness, tool)
        assert "grind --harness auto" in text, harness
        assert "/path/to/session.jsonl --harness" in text, harness
        assert "python3 -m agentgrinder demo" in text, harness
        # and it still says where it looked, for every tool, every time
        assert "~/.cursor/projects/*/agent-transcripts/*/*.jsonl" in text, harness
        assert "~/.claude/projects/*/*.jsonl" in text, harness


def test_the_cursor_miss_is_no_longer_a_one_line_dead_end(tmp_path):
    done = _grind(tmp_path, "--harness", "cursor", "--no-open", "--no-series")
    assert done.returncode == 1
    assert "no Cursor session found on this machine" in done.stdout
    assert len(done.stdout.strip().splitlines()) > 5      # it was one line, with no way forward
    assert "--harness cursor" not in done.stdout.split("Next step:")[0]
