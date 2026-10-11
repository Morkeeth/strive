"""THE CARD A PERSON WOULD SHARE — the four defects of the 22 Sep 2026 Cursor card, pinned.

Verdict on a real 8m19s Cursor run, rendered by the shipped code: nobody would share it. What it
printed, in the order a reader met it:

    you / Y                       an avatar and a name for a person who is not on the card
    Users-morkeeth · Cursor sitting   the author's macOS account name as the title
    PACECARD                      a brand the product does not use
    Unknown  OUTPUT               the headline stat
    — — — —                       four of the five proof cells, and Files

Every test here fails on that card and passes on this one. `_cursor_run` is the shape that
transcript produces: no commits, no files written, no claim evidence — the ordinary short
session the card has to be honest and shareable about at the same time.
"""
import json
import re
import subprocess
import sys

sys.path.insert(0, __file__.rsplit("/tests/", 1)[0])

from agentgrinder import identity, privacy
from agentgrinder.brand import BRAND
from agentgrinder.ingest import parse_cursor_session
from agentgrinder.metrics import build_activity
from agentgrinder.outcome import NOTHING_SHIPPED, hero_of, outcome_of
from agentgrinder.render import render_card
from agentgrinder.solocard import render_solo_card


def _cursor_run(**over):
    """The measured shape of the 8m19s session: a ridge, turns, calls, and nothing shipped."""
    run = {
        "athlete": "you",
        "title": "Users-morkeeth · Cursor sitting",
        "harness": "Cursor",
        "project": "Users-morkeeth",
        "project_proven": False,
        "started": "2026-09-22T16:29:00",
        "duration_s": None,
        "turns_typed": 4,
        "tool_calls": 63,
        "shell_calls": 9,
        "files_touched": None,
        "commits": None,
        "claims": None,
        "claims_verified": None,
        "artifacts_produced": None,
        "artifacts_promised": None,
        "corrections": None,
        "reach": None,
        "rhythm": [1, 1, 1, 1],
        "ridge": [i % 7 for i in range(50)],
        "worker_bins": [0] * 50,
        "commit_bins": [],
        "ridge_basis": "wall-time",
        "ridge_wall_seconds": 499,
        "capabilities": {"timed_trace": False, "claim_evidence": False, "authorship": True},
    }
    run.update(over)
    return run


def _card(**over):
    return render_card(build_activity(_cursor_run(**over)))


# ---- 1. the headline is an outcome sentence, never a metric identity reading Unknown ----------

def test_headline_is_an_outcome_sentence_and_never_reads_unknown():
    html = _card()
    assert "Unknown" not in html
    # "nothing shipped" is a measurement, said once under the card with what it looked for
    assert f"{NOTHING_SHIPPED}: no commit, pull request or shipped artifact was recorded in this run." in html
def test_a_commit_makes_its_subject_the_headline():
    run = _cursor_run(commits=2, project="agentgrinder-public", project_proven=True,
                      commits_list=[{"hash": "aaa1111", "at": "2026-09-22T16:31:00",
                                     "subject": "Strip the home path from the run card title"},
                                    {"hash": "bbb2222", "at": "2026-09-22T16:33:00",
                                     "subject": "Hide every stat the run cannot prove"}])
    outcome = outcome_of(run)
    assert outcome.text == "Hide every stat the run cannot prove"
    assert outcome.shipped and outcome.measured
    assert outcome.basis == "last of 2 commits git recorded in this run's window"
    assert "Hide every stat the run cannot prove" in render_card(build_activity(run))


def test_a_declared_outcome_with_a_receipt_leads_and_says_it_was_declared():
    run = _cursor_run(shipped=["Merged PR 42 into main"],
                      receipts=[{"label": "PR 42", "url": "https://github.com/o/r/pull/42"}])
    outcome = outcome_of(run)
    assert outcome.text == "Merged PR 42 into main"
    assert outcome.shipped and not outcome.measured
    assert "declared by the author" in outcome.basis


def test_an_outcome_is_never_invented_from_activity_alone():
    """Tool calls, prompts and a long trace are not an outcome. Only the ladder's rungs are."""
    for over in ({}, {"tool_calls": 900}, {"turns_typed": 40}, {"files_touched": 6},
                 {"files_changed": 3}):
        assert outcome_of(_cursor_run(**over)).text == NOTHING_SHIPPED
    assert "3 files changed, and no commit" in outcome_of(_cursor_run(files_changed=3)).basis


# ---- 2. one hero number the run can prove, and no dash rows at all ----------------------------

def test_the_hero_number_is_one_count_the_run_can_prove():
    assert hero_of(_cursor_run()) == hero_of(_cursor_run())
    assert (hero_of(_cursor_run()).value, hero_of(_cursor_run()).label) == ("63", "tool calls")
    assert (hero_of(_cursor_run(commits=3)).value,
            hero_of(_cursor_run(commits=3)).label) == ("3", "commits landed")
    assert (hero_of(_cursor_run(files_changed=5)).value,
            hero_of(_cursor_run(files_changed=5)).label) == ("5", "files changed")
    assert (hero_of(_cursor_run(checks_passed=12)).value,
            hero_of(_cursor_run(checks_passed=12)).label) == ("12", "checks passing")
    assert hero_of(_cursor_run(commits=1)).label == "commit landed"      # one, not "1 commits"
    # a run that measured nothing at all gets no hero block, never a zero nobody counted
    empty = _cursor_run(tool_calls=None, turns_typed=None)
    assert not hero_of(empty)
    assert 'class="hero"' not in render_card(build_activity(empty))


def test_no_stat_on_the_card_is_a_dash():
    """The 22 Sep card drew four em-dash cells and a `Files —`. A dash is not a measurement."""
    for html in (_card(), _card(commits=2, files_touched=4, files_changed=4),
                 _card(ridge=[], ridge_basis="", ridge_wall_seconds=None)):
        for cell in html.split('<div class="stat">')[1:]:
            value = cell.split('<div class="v">')[1].split("</div>")[0]
            assert value.strip() not in ("—", "", "Unknown"), value
        for cell in re.findall(r'<div class="five[^"]*"[^>]*>(.*?)</div></div>', html):
            value = cell.split('<div class="v">')[1].split("</div>")[0]
            assert any(ch.isdigit() for ch in value), value


def test_what_is_missing_is_not_drawn():
    """The card is the feed card: a figure the run did not measure is left out, not dashed.
    Missing time on a turn-order trace is still said in words, under the card."""
    html = _card(ridge=[], ridge_basis="", ridge_wall_seconds=None, trace_basis="typed-turn order")
    card = html.split('<article class="card fc">')[1].split("</article>")[0]
    assert "—" not in card and "Unknown" not in card and "<dt>Time</dt>" not in card
    assert "not a measured elapsed clock" in html
# ---- 3. identity and title ---------------------------------------------------------------------

def test_the_card_never_says_you_and_never_draws_a_y_avatar():
    html = _card()
    assert ">you<" not in html and ">Y<" not in html
    assert f'<span class="fc-name">{identity.NEUTRAL_LABEL}</span>' in html
    assert identity.NOT_SIGNED_IN in html
    # no account: the initial of the neutral label, never a blank disc and never a remote image
    assert f'<span class="fc-face fc-mono" style="--s:40px" aria-hidden="true">{identity.NEUTRAL_LABEL[0]}</span>' in html
    assert "<img" not in html
def test_a_signed_in_run_carries_the_github_handle_and_an_initial_not_a_remote_avatar():
    # A local card loads nothing from the network (review of 24 Sep 2026): the face is the
    # handle's initial, so opening the card tells GitHub nothing.
    html = _card(athlete_handle="morkeeth")
    assert '<span class="fc-name">@morkeeth</span>' in html
    assert '<span class="fc-face fc-mono" style="--s:40px" aria-hidden="true">@</span>' in html
    assert "github.com/morkeeth.png" not in html and "<img" not in html
    assert identity.NOT_SIGNED_IN not in html
def test_a_named_athlete_is_a_display_name_and_never_fetches_an_avatar(tmp_path, monkeypatch):
    # A machine with no GitHub login anywhere: no gh config, no github.user, no environment.
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    monkeypatch.delenv(identity.ENV_HANDLE, raising=False)
    monkeypatch.setattr(identity, "_git_github_user", lambda root=None: None)

    who = identity.resolve("Oscar")
    assert who.display == "Oscar" and not who.signed_in and who.avatar_url == ""
    assert identity.resolve("@oscar").signed_in
    for placeholder in ("you", "me", "athlete", "", None):
        assert identity.resolve(placeholder).display == identity.NEUTRAL_LABEL


def test_github_cli_credential_file_is_ignored(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    monkeypatch.delenv(identity.ENV_HANDLE, raising=False)
    monkeypatch.setattr(identity, "_git_github_user", lambda root=None: None)
    hosts = tmp_path / "gh"
    hosts.mkdir()
    (hosts / "hosts.yml").write_text("github.com:\n    user: morkeeth\n    git_protocol: https\n")

    who = identity.resolve()
    assert who.handle is None and not who.signed_in
    assert who.avatar_url == ""


def test_the_title_comes_from_the_repository_and_never_from_a_filesystem_path(tmp_path):
    lines = ('{"role":"user","message":{"content":"<user_query>go</user_query>"}}\n'
             '{"role":"assistant","message":{"content":[{"type":"tool_use"}]}}\n')
    folder = tmp_path / "Users-morkeeth" / "agent-transcripts" / "cccc"
    folder.mkdir(parents=True)
    transcript = folder / "t.jsonl"
    transcript.write_text(lines, encoding="utf-8")
    run = parse_cursor_session(str(transcript))
    assert run["title"] == "Cursor sitting"
    assert run["project"] is None
    assert "morkeeth" not in json.dumps(run)


def test_no_home_directory_or_account_name_reaches_any_card():
    leaks = ("/Users/", "Users-morkeeth", "Users-alice", "/home/ubuntu", "~/")
    html = _card(title="Users-morkeeth · Cursor sitting", project="Users-morkeeth")
    for leak in leaks:
        assert leak not in html, leak
    assert not privacy.scan_html(html)
    activity = build_activity(_cursor_run())
    assert "morkeeth" not in activity.title and "morkeeth" not in activity.project
    assert privacy.strip_home_names("/Users/alice/code/app") == "code/app"
    assert privacy.strip_home_names("-Users-bob-work") == "work"
    # an ordinary sentence with the word "home" in it is not a path and is left alone
    assert privacy.strip_home_names("fix the home-page layout") == "fix the home-page layout"


# ---- 4. the brand -------------------------------------------------------------------------------

def test_every_card_is_branded_strive():
    assert BRAND == "STRIVE"
    html = _card()
    assert '<div class="brand">STRIVE</div>' in html
    assert "PACECARD" not in html and "AGENTGRINDER" not in html and "AGENT GRINDER" not in html
    plain = _card(ridge=[], ridge_basis="", ridge_wall_seconds=None)
    assert '<div class="brand">STRIVE</div>' in plain
    assert "AGENTGRINDER" not in plain


def test_the_python_brand_matches_the_one_the_site_ships():
    source = open(__file__.rsplit("/tests/", 1)[0] + "/server/brand.mjs", encoding="utf-8").read()
    assert f"export const BRAND='{BRAND}';" in source


def _solo_run(tmp_path):
    """One real two-turn Claude Code sitting, parsed from a transcript on disk."""
    made = tmp_path / "out.md"
    made.write_text("x")
    def record(kind, content, stamp):
        return json.dumps({"type": kind, "timestamp": stamp, "cwd": str(tmp_path),
                           "promptSource": "typed" if kind == "user" else None,
                           "message": {"role": kind, "content": content}})
    lines = [
        record("user", "please fix it", "2026-09-22T10:00:00Z"),
        record("assistant", [{"type": "tool_use", "name": "Write",
                              "input": {"file_path": str(made)}}], "2026-09-22T10:00:10Z"),
        record("assistant", [{"type": "text", "text": "Done."}], "2026-09-22T10:00:30Z"),
        record("user", "and the other thing", "2026-09-22T10:04:00Z"),
        record("assistant", [{"type": "text", "text": "Fixed."}], "2026-09-22T10:05:00Z"),
    ]
    transcript = tmp_path / "s.jsonl"
    transcript.write_text("\n".join(lines) + "\n", encoding="utf-8")
    from agentgrinder.solo import parse_solo
    return parse_solo(str(transcript))


def test_the_grind_card_is_branded_strive_and_never_says_you(tmp_path):
    run = _solo_run(tmp_path)
    html = render_solo_card(run)
    assert '<div class="brand">STRIVE</div>' in html
    assert "AGENT GRINDER" not in html
    assert ">you<" not in html and ">Y<" not in html
    assert f'<span class="fc-name">{identity.NEUTRAL_LABEL}</span>' in html
    card = html.split('<article class="card fc">')[1].split("</article>")[0]
    assert "—" not in card and "Unknown" not in card


# ---- the terminal says the same thing as the card ----------------------------------------------

def test_the_command_line_summary_leads_with_the_same_outcome(tmp_path):
    run = _cursor_run(commits=1, project="agentgrinder-public", project_proven=True,
                      commits_list=[{"hash": "aaa1111", "at": "2026-09-22T16:31:00",
                                     "subject": "Put the outcome at the top of the card"}])
    path = tmp_path / "run.json"
    path.write_text(json.dumps(run), encoding="utf-8")
    out = subprocess.run([sys.executable, "-m", "agentgrinder", "card", str(path),
                          "-o", str(tmp_path / "card.html"), "--no-open"],
                         cwd=__file__.rsplit("/tests/", 1)[0],
                         capture_output=True, text=True, check=True).stdout
    assert "Put the outcome at the top of the card" in out
    assert " you " not in out
    assert "1 commit ·" in " ".join(out.split())        # the card's big number, singular
