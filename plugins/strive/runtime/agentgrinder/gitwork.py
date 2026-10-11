"""GIT AS THE WITNESS — what a session actually shipped, asked of git, never of the transcript.

The fleet card could only place a commit on a REPOSITORY, because nothing in a transcript proves
which of 24 parallel lanes wrote it. A solo session has no such ambiguity, and git itself carries
the finer fact: `git log --name-only` names the FILES in every commit. So on the solo route a
commit tick sits on the row of each file it actually contains -- a stronger claim than the fleet
card can make, and still a claim git proves rather than one the transcript implies.

Two traps this module exists to not fall into, both learned the expensive way in this repo:

  * a window without an explicit offset. `git log --since '2026-08-30T19:38:13'` returned 4
    commits and `--since '...Z'` returned 2, for the same nominal instant: git read the naive
    stamp in the machine's local zone and ran the window two hours early. Every stamp here is
    converted to UTC and carries its `Z`.
  * a linked worktree counted as its own repository. It has its own directory name and its own
    `.git` file but shares refs with its parent, so `git log` in both returns the same commits.
    32 of 99 commits were counted twice before `--git-common-dir` was consulted (fleet.py).
"""
from __future__ import annotations

import os
import subprocess
from datetime import datetime, timezone



def parse_iso(s: str) -> datetime:
    """`Z` is a valid ISO-8601 offset, and `datetime.fromisoformat` did not accept it until 3.11.

    macOS ships /usr/bin/python3 = 3.9.6, and `git log --pretty=%cI` prints `Z` whenever the
    committer's offset is UTC. So on a stock Mac `agentgrinder nightrun` and `authorship` died
    with `ValueError: Invalid isoformat string: '2026-08-31T00:19:25Z'` while `grind` worked,
    because the solo path had already been written Z-tolerant and the fleet path had not. Found
    31 Aug 06:0x by RUNNING every command under /usr/bin/python3 — nothing in the repo said the
    package needed 3.11, and pyproject.toml claimed 3.10.
    """
    s = s.strip()
    if s[-1:] in ("Z", "z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)

_CANON: dict[str, tuple[str, str] | None] = {}
_LOG: dict[tuple, list] = {}
HOME = os.path.expanduser("~")


def _run(args: list[str], timeout: int = 25):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        return None


def repo_of(path: str) -> tuple[str, str] | None:
    """(repository_name, repository_root) enclosing `path`, resolving a linked worktree to its
    parent repository. None when the path is not inside a work tree at all."""
    d = path if os.path.isdir(path) else os.path.dirname(path)
    if not d:
        return None
    if d in _CANON:
        return _CANON[d]
    out = _run(["git", "-C", d, "rev-parse", "--show-toplevel"], timeout=10)
    if not out or out.returncode != 0:
        _CANON[d] = None
        return None
    root = out.stdout.strip()
    common = _run(["git", "-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], timeout=10)
    if common and common.returncode == 0:
        c = common.stdout.strip()
        if c.endswith("/.git"):
            root = os.path.dirname(c)
    hit = (os.path.basename(root), root)
    _CANON[d] = hit
    return hit


def _z(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def commits_in(root: str, since: datetime, until: datetime) -> list[dict]:
    """Every commit on any ref between two instants, with the files it touched.

    `--all` because a session's work often lands on a feature branch that is not checked out now.
    Paths come back repository-relative from git; they are made absolute against `root` so a
    caller can compare them to the absolute paths a transcript records.
    """
    key = (root, since.isoformat(), until.isoformat())
    if key in _LOG:
        return _LOG[key]
    out = _run(["git", "-C", root, "log", "--all", "--since", _z(since), "--until", _z(until),
                "--name-only", "--no-renames", "--pretty=format:%x01%H%x1f%cI%x1f%s"])
    if not out or out.returncode != 0:
        _LOG[key] = []
        return []
    commits, seen = [], set()
    for chunk in out.stdout.split("\x01"):
        chunk = chunk.strip("\n")
        if not chunk:
            continue
        head, _, rest = chunk.partition("\n")
        parts = head.split("\x1f")
        if len(parts) < 3:
            continue
        h, when, subject = parts[0], parts[1], parts[2]
        if h in seen:
            continue
        seen.add(h)
        files = [os.path.join(root, ln.strip()) for ln in rest.split("\n") if ln.strip()]
        commits.append(dict(hash=h[:7], at=parse_iso(when).astimezone().isoformat(),
                            subject=subject, files=files))
    commits.sort(key=lambda c: c["at"])
    _LOG[key] = commits
    return commits


def ignored(root: str, paths: list[str]) -> set[str]:
    """The subset of `paths` git is configured to ignore.

    A `.env.local` edited during a session is not a dead end -- it is a file that was never going
    to be committed. Without this guard the card would print an accusation about a design choice.
    """
    if not paths:
        return set()
    try:
        res = subprocess.run(["git", "-C", root, "check-ignore", "--stdin"],
                             input="\n".join(paths), capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return set()
    return {ln.strip() for ln in res.stdout.split("\n") if ln.strip()}


def tracked(root: str, paths: list[str]) -> set[str]:
    """The subset of `paths` git already has under version control."""
    if not paths:
        return set()
    out = _run(["git", "-C", root, "ls-files", "--error-unmatch", "-z", "--"] + paths, timeout=20)
    if out is None:
        return set()
    return {os.path.join(root, p) for p in out.stdout.split("\0") if p.strip()}


def touched_since(root: str, paths: list[str], after: datetime) -> dict[str, str | None]:
    """For each path: the ISO time of the FIRST commit that touched it after `after`, else None.

    This exists because of a false sentence caught by control, not by a test. The card's first
    version called a file a dead end when no commit INSIDE THE GRIND'S WINDOW contained it. On
    a real repo C session (23 Jul, 16:02–17:02) that printed four dead ends -- and every one of
    the four was committed at 17:43, 41 minutes after the window closed, in `8379081`. The
    sentence was true about the window and false about the world: a person reads "no commit" as
    "this did not ship", and it shipped in the very next commit.

    A window boundary is an arbitrary line through a working day. The provable claim is about the
    file's whole history: has ANY commit, on ANY branch, touched this file since you edited it?
    """
    out: dict[str, str | None] = {}
    for p in paths:
        r = _run(["git", "-C", root, "log", "--all", "--reverse", "--pretty=%cI", "--", p], timeout=20)
        if not r or r.returncode != 0:
            out[p] = None
            continue
        later = [parse_iso(ln).astimezone()
                 for ln in r.stdout.split("\n") if ln.strip()]
        later = [t for t in later if t > after]
        out[p] = later[0].isoformat() if later else None
    return out
