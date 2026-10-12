"""REACH — did the output cross to a person who is not the author?

Three fixtures, three answers, all from real git repositories built in a temp directory and
driven by the real `git` binary, because the whole claim of this number is that the MACHINE can
answer it. Every subprocess the reader spawns runs with an empty global git config
(`GIT_CONFIG_GLOBAL` + `GIT_CONFIG_NOSYSTEM`) and a temp `XDG_CONFIG_HOME`, so the author's own
identity and any `insteadOf` rewrite on this machine cannot leak into the answer under test.

The capture path never invokes `gh`; ambiguous ownership remains unknown.
"""
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from agentgrinder import reach
from agentgrinder.ingest import parse_codex_session, parse_cursor_session, parse_session

NOW = datetime.now(timezone.utc)
WINDOW = (NOW - timedelta(hours=1), NOW + timedelta(minutes=1))


@pytest.fixture(autouse=True)
def _hermetic(tmp_path, monkeypatch):
    # Freeze the window when this test starts, not when pytest collects the whole suite.
    # Other tests can take minutes before these real pushes happen.
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(sys.modules[__name__], "NOW", now)
    monkeypatch.setattr(sys.modules[__name__], "WINDOW", (now - timedelta(hours=1), now + timedelta(minutes=1)))
    empty = tmp_path / "gitconfig-empty"
    empty.write_text("")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(empty))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "xdg"))   # no gh hosts.yml in here


def _git(root, *args, **env):
    e = dict(os.environ, GIT_AUTHOR_NAME="B", GIT_COMMITTER_NAME="B",
             GIT_AUTHOR_EMAIL="bob@example.com", GIT_COMMITTER_EMAIL="bob@example.com", **env)
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, env=e)


def _repo(tmp_path, name="work"):
    root = tmp_path / name
    root.mkdir()
    _git(root, "init", "-q", "-b", "main")
    _git(root, "config", "user.email", "bob@example.com")
    _git(root, "config", "user.name", "B")
    _git(root, "config", "github.user", "bob")          # the STRONG identity, read with no network
    (root / "a.txt").write_text("one")
    _git(root, "add", "a.txt")
    _git(root, "commit", "-q", "-m", "one")
    return root


def _head(root):
    return _git(root, "rev-parse", "HEAD").stdout.strip()[:7]


def test_a_commit_that_never_left_the_machine_is_false(tmp_path):
    root = _repo(tmp_path)
    value, why = reach.reach_of(str(root), *WINDOW, [_head(root)])
    assert value is False
    assert "never left this machine" in why


def test_a_branch_pushed_to_a_repository_the_author_does_not_own_is_true(tmp_path, monkeypatch):
    """The remote is owned by `alice`; the author is `bob`. The push URL is a local bare repo, so
    no network is touched, and ownership is read from `remote.origin.url` the way git config
    holds it (not from `git remote -v`, which would print it after any `insteadOf` rewrite).

    The org lookup is the only part faked, and only its EFFECT: `gh` was asked and named no
    organisation. The rule under test — compare the owner to the author's account and to their
    organisations — runs for real."""
    monkeypatch.setattr(reach, "_gh_orgs", lambda root: (set(), True))
    bare = tmp_path / "alice-thing.git"
    subprocess.run(["git", "init", "-q", "--bare", str(bare)], check=True,
                   env=dict(os.environ, GIT_CONFIG_NOSYSTEM="1"))
    root = _repo(tmp_path)
    _git(root, "remote", "add", "origin", "https://github.com/alice/thing.git")
    _git(root, "config", "remote.origin.pushurl", str(bare))
    assert _git(root, "push", "-q", "origin", "HEAD:refs/heads/main").returncode == 0

    value, why = reach.reach_of(str(root), *WINDOW, [_head(root)])
    assert value is True, why
    assert why == reach.R_FOREIGN
    assert "alice" not in why and str(tmp_path) not in why      # no names, no paths ever travel


def test_an_organisation_the_author_belongs_to_is_not_another_person(tmp_path, monkeypatch):
    """The first real run of this module printed reach=yes for a push to the author's own GitHub
    ORGANISATION: correct about the string `MorkeethHQ != Morkeeth`, false about the world.
    An owner outside the author's login is now checked against their organisations first."""
    monkeypatch.setattr(reach, "_gh_orgs", lambda root: ({"acme"}, True))
    bare = tmp_path / "acme-thing.git"
    subprocess.run(["git", "init", "-q", "--bare", str(bare)], check=True,
                   env=dict(os.environ, GIT_CONFIG_NOSYSTEM="1"))
    root = _repo(tmp_path)
    _git(root, "remote", "add", "origin", "https://github.com/acme/thing.git")
    _git(root, "config", "remote.origin.pushurl", str(bare))
    _git(root, "push", "-q", "origin", "HEAD:refs/heads/main")

    value, why = reach.reach_of(str(root), *WINDOW, [_head(root)])
    assert value is None
    assert why == reach.R_OWN_ONLY


def test_without_gh_a_foreign_looking_owner_is_a_dash_not_a_yes(tmp_path):
    """This is the offline case: the owner
    is not the author's login, and nothing offline separates a stranger's account from an
    organisation the author is in. That is an unknown answer, never a yes."""
    bare = tmp_path / "alice-off.git"
    subprocess.run(["git", "init", "-q", "--bare", str(bare)], check=True,
                   env=dict(os.environ, GIT_CONFIG_NOSYSTEM="1"))
    root = _repo(tmp_path)
    _git(root, "remote", "add", "origin", "https://github.com/alice/off.git")
    _git(root, "config", "remote.origin.pushurl", str(bare))
    _git(root, "push", "-q", "origin", "HEAD:refs/heads/main")

    value, why = reach.reach_of(str(root), *WINDOW, [_head(root)])
    assert value is None
    assert why == reach.R_OWNER_UNVERIFIED
    assert "gh" in why


def test_a_push_to_the_authors_own_remote_is_null_not_true(tmp_path):
    """Owning both ends is not a crossing to another person, and this disk cannot say who read
    it. That is a dash with a reason, never a yes."""
    bare = tmp_path / "bob-thing.git"
    subprocess.run(["git", "init", "-q", "--bare", str(bare)], check=True,
                   env=dict(os.environ, GIT_CONFIG_NOSYSTEM="1"))
    root = _repo(tmp_path)
    _git(root, "remote", "add", "origin", "https://github.com/bob/thing.git")
    _git(root, "config", "remote.origin.pushurl", str(bare))
    _git(root, "push", "-q", "origin", "HEAD:refs/heads/main")

    value, why = reach.reach_of(str(root), *WINDOW, [_head(root)])
    assert value is None
    assert why == reach.R_OWN_ONLY


def test_a_push_to_a_directory_on_this_machine_is_not_a_crossing(tmp_path):
    bare = tmp_path / "local.git"
    subprocess.run(["git", "init", "-q", "--bare", str(bare)], check=True,
                   env=dict(os.environ, GIT_CONFIG_NOSYSTEM="1"))
    root = _repo(tmp_path)
    _git(root, "remote", "add", "origin", str(bare))
    _git(root, "push", "-q", "origin", "HEAD:refs/heads/main")

    value, why = reach.reach_of(str(root), *WINDOW, [_head(root)])
    assert value is False
    assert "never left this machine" in why


def test_a_push_after_the_window_closed_is_null_not_true(tmp_path):
    """`gitwork.touched_since` was written because a window-bound sentence was false about the
    world. The same care here: work that left AFTER this run closed did not cross in this run."""
    bare = tmp_path / "alice-late.git"
    subprocess.run(["git", "init", "-q", "--bare", str(bare)], check=True,
                   env=dict(os.environ, GIT_CONFIG_NOSYSTEM="1"))
    root = _repo(tmp_path)
    _git(root, "remote", "add", "origin", "https://github.com/alice/late.git")
    _git(root, "config", "remote.origin.pushurl", str(bare))
    _git(root, "push", "-q", "origin", "HEAD:refs/heads/main")

    old = (NOW - timedelta(days=3), NOW - timedelta(days=3) + timedelta(hours=1))
    value, why = reach.reach_of(str(root), *old, [_head(root)])
    assert value is None
    assert why == reach.R_LATE


def _push_at(root, when, ref="HEAD:refs/heads/main"):
    """Push with the reflog stamped at a chosen instant. `git` writes the reflog entry with the
    committer date, so this is how a push that happened at another hour is reproduced."""
    return _git(root, "push", "-q", "origin", ref,
                GIT_COMMITTER_DATE=when.isoformat(), GIT_AUTHOR_DATE=when.isoformat())


def _foreign_remote(tmp_path, root, name):
    bare = tmp_path / f"{name}.git"
    subprocess.run(["git", "init", "-q", "--bare", str(bare)], check=True,
                   env=dict(os.environ, GIT_CONFIG_NOSYSTEM="1"))
    _git(root, "remote", "add", "origin", f"https://github.com/alice/{name}.git")
    _git(root, "config", "remote.origin.pushurl", str(bare))


def test_a_fetch_inside_the_window_is_not_your_commit_crossing(tmp_path, monkeypatch):
    """THE DEFECT THIS PINS: the first version asked "did this ref move during the window", not
    "did YOUR commit reach the remote during it". A pull at the start of a session moves
    origin/main while carrying nothing of yours; the work is pushed after the run closes; and the
    card printed reach=yes for a crossing that happened in somebody else's window."""
    monkeypatch.setattr(reach, "_gh_orgs", lambda root: (set(), True))
    root = _repo(tmp_path)
    _foreign_remote(tmp_path, root, "fetchy")
    _push_at(root, NOW - timedelta(minutes=30))          # a ref move INSIDE the window

    (root / "b.txt").write_text("two")                   # the run's own commit, made now
    _git(root, "add", "b.txt")
    _git(root, "commit", "-q", "-m", "two")
    mine = _head(root)
    _push_at(root, NOW + timedelta(hours=2))             # pushed two hours AFTER the run closed

    value, why = reach.reach_of(str(root), *WINDOW, [mine])
    assert value is None, why
    assert why == reach.R_LATE


def test_an_old_ref_and_a_late_push_is_a_dash_not_a_false(tmp_path, monkeypatch):
    """The mirror defect: with the ref's only in-window move absent, the first version fell
    through to "none of them is on any remote", which is the flattering-and-false sentence in the
    other direction. The work DID leave; it left outside this run."""
    monkeypatch.setattr(reach, "_gh_orgs", lambda root: (set(), True))
    root = _repo(tmp_path)
    _foreign_remote(tmp_path, root, "oldy")
    _push_at(root, NOW - timedelta(days=2))              # the ref last moved two days ago

    (root / "b.txt").write_text("two")
    _git(root, "add", "b.txt")
    _git(root, "commit", "-q", "-m", "two")
    mine = _head(root)
    _push_at(root, NOW + timedelta(hours=2))

    value, why = reach.reach_of(str(root), *WINDOW, [mine])
    assert value is None, why
    assert why == reach.R_LATE


def test_the_push_that_carried_the_commit_inside_the_window_is_the_one_that_counts(tmp_path, monkeypatch):
    """The positive control for both tests above: same shape, the carrying push inside the run."""
    monkeypatch.setattr(reach, "_gh_orgs", lambda root: (set(), True))
    root = _repo(tmp_path)
    _foreign_remote(tmp_path, root, "timely")
    _push_at(root, NOW - timedelta(days=2))

    (root / "b.txt").write_text("two")
    _git(root, "add", "b.txt")
    _git(root, "commit", "-q", "-m", "two")
    mine = _head(root)
    _push_at(root, NOW - timedelta(minutes=10))          # inside the window

    value, why = reach.reach_of(str(root), *WINDOW, [mine])
    assert value is True, why
    assert why == reach.R_FOREIGN


def test_without_an_account_name_on_this_machine_ownership_is_not_guessed(tmp_path):
    """An email local part is not a GitHub login. With no strong identity the answer is a dash,
    because "a repository the author does not own" would be a sentence nobody measured."""
    bare = tmp_path / "alice-noid.git"
    subprocess.run(["git", "init", "-q", "--bare", str(bare)], check=True,
                   env=dict(os.environ, GIT_CONFIG_NOSYSTEM="1"))
    root = _repo(tmp_path)
    _git(root, "config", "--unset", "github.user")
    _git(root, "remote", "add", "origin", "https://github.com/alice/noid.git")
    _git(root, "config", "remote.origin.pushurl", str(bare))
    _git(root, "push", "-q", "origin", "HEAD:refs/heads/main")

    value, why = reach.reach_of(str(root), *WINDOW, [_head(root)])
    assert value is None
    assert why == reach.R_NO_IDENTITY


def test_no_commits_and_no_repository_are_two_different_dashes(tmp_path):
    root = _repo(tmp_path)
    assert reach.reach_of(str(root), *WINDOW, []) == (None, reach.R_NO_COMMITS)
    assert reach.reach_of(None, *WINDOW, ["abc1234"]) == (None, reach.R_NO_REPO)
    assert reach.reach_of(str(tmp_path / "nowhere"), *WINDOW, ["abc1234"]) == (None, reach.R_NO_REPO)


def test_owner_parsing_covers_the_shapes_a_remote_actually_takes():
    assert reach.owner_of("https://github.com/alice/thing.git") == "alice"
    assert reach.owner_of("git@github.com:Alice/thing.git") == "alice"
    assert reach.owner_of("ssh://git@gitlab.com/team/sub/proj.git") == "sub"
    assert reach.owner_of("/tmp/bare.git") == ""            # this machine
    assert reach.owner_of("file:///tmp/bare.git") == ""      # this machine
    assert reach.owner_of("../sibling") == ""
    assert reach.owner_of("") is None


# ---- the reader wires it through -------------------------------------------------------------
def _claude_jsonl(tmp_path, cwd, when):
    import json
    lines = [
        {"type": "user", "timestamp": when.isoformat().replace("+00:00", "Z"), "cwd": str(cwd),
         "promptSource": "typed", "message": {"role": "user", "content": "make it"}},
        {"type": "assistant", "timestamp": when.isoformat().replace("+00:00", "Z"),
         "message": {"role": "assistant", "content": [{"type": "text", "text": "done"}]}},
    ]
    p = tmp_path / "s.jsonl"
    p.write_text("\n".join(json.dumps(x) for x in lines) + "\n")
    return str(p)


def test_the_claude_reader_carries_reach_and_its_reason(tmp_path):
    root = _repo(tmp_path)
    run = parse_session(_claude_jsonl(tmp_path, root, NOW - timedelta(minutes=5)))
    assert run["reach"] is None                     # the commit predates the window
    assert run["reach_reason"] == reach.R_NO_COMMITS


def test_a_cursor_run_and_a_codex_run_name_the_fact_they_are_missing(tmp_path):
    """Both used to print "this harness cannot supply it". Both sentences were false.

    Cursor's transcript carries absolute paths for every file it writes, and Codex records a cwd
    in `session_meta` and stamps an ISO timestamp on every record. So the reason a dash appears is
    a fact about THIS session, and the parsers now say which one. A session that wrote nothing
    still gets a dash; it just gets an accurate sentence with it.
    """
    cur = tmp_path / "c.jsonl"
    cur.write_text('{"role":"user","message":{"content":"<timestamp>Wednesday, Sep 03, 2026, '
                   '10:00 AM</timestamp><user_query>go</user_query>"}}\n', encoding="utf-8")
    run = parse_cursor_session(str(cur))
    # nothing written, so no repository can be found from the files
    assert run["reach"] is None and run["reach_reason"] == reach.R_NO_FILES

    cod = tmp_path / "rollout-x.jsonl"
    cod.write_text('{"type":"session_meta","payload":{"cwd":"/x/y"}}\n'
                   '{"type":"event_msg","timestamp":"2026-09-03T10:01:00Z","payload":{"type":"user_message","message":"go"}}\n', encoding="utf-8")
    run = parse_codex_session(str(cod))
    # one record, so no window can be drawn; that is the missing fact, not the harness
    assert run["reach"] is None and run["reach_reason"] == reach.R_NO_WINDOW


def test_a_codex_run_whose_cwd_is_gone_says_so(tmp_path):
    cod = tmp_path / "rollout-y.jsonl"
    cod.write_text(
        '{"type":"session_meta","timestamp":"2026-09-03T10:00:00.000Z",'
        '"payload":{"cwd":"/no/such/directory","type":"session_meta"}}\n'
        '{"type":"event_msg","timestamp":"2026-09-03T10:05:00.000Z",'
        '"payload":{"type":"user_message"}}\n'
        '{"type":"event_msg","timestamp":"2026-09-03T10:06:00.000Z","payload":{"type":"x"}}\n',
        encoding="utf-8")
    run = parse_codex_session(str(cod))
    assert run["reach"] is None and run["reach_reason"] == reach.R_CWD_GONE


def test_a_codex_run_outside_a_work_tree_says_so(tmp_path):
    outside = tmp_path / "notarepo"
    outside.mkdir()
    cod = tmp_path / "rollout-z.jsonl"
    cod.write_text(
        '{"type":"session_meta","timestamp":"2026-09-03T10:00:00.000Z",'
        '"payload":{"cwd":"%s","type":"session_meta"}}\n'
        '{"type":"event_msg","timestamp":"2026-09-03T10:05:00.000Z",'
        '"payload":{"type":"user_message"}}\n'
        '{"type":"event_msg","timestamp":"2026-09-03T10:06:00.000Z","payload":{"type":"x"}}\n'
        % outside, encoding="utf-8")
    run = parse_codex_session(str(cod))
    assert run["reach"] is None and run["reach_reason"] == reach.R_CWD_NOT_REPO
