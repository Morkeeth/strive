"""REACH — did the output cross to a person who is not the author?

The database column carries the definition verbatim: *the output crossed to a person who is not
the author*. This module answers it from the machine, with git as the witness, and answers
`None` whenever the machine cannot tell. A dash is the honest default; a guess is not.

    True   a commit made inside the session window sits on a remote whose owner is neither the
           author nor an organisation the author belongs to, and the push happened while the
           window was open.
    False  the window closed with commits that are on no remote at all: they never left.
    None   everything else, each with its own sentence: no commits, no repository the harness
           can name, a push that landed after the window closed, a remote nobody can attribute,
           or commits that only ever reached the author's OWN remote (a repository the author
           owns is not another person, and who read it is not a fact on this disk).

Three traps this module is built around.

  * `git remote -v` prints URLs after `insteadOf` rewriting, so a person with
    `url.git@github.com:.insteadOf = https://github.com/` gets a different string than the one
    their config holds. Ownership is read from `git config remote.<name>.url`.
  * a local or `file://` remote is still this machine. Pushing to a bare repository in another
    directory is not a crossing, so those remotes count toward FALSE, never toward TRUE.
  * AN ORGANISATION THE AUTHOR BELONGS TO IS NOT ANOTHER PERSON. The first real run of this
    module returned True for a push to `MorkeethHQ/…` because the owner was not the author's
    login — correct about the string and false about the world. The owner is therefore compared
    to the author's login AND to the organisations `gh` says they are a member of; with no
    signed-in `gh` the answer is None, because offline nothing separates an organisation you
    belong to from a stranger's account.
  * an email local part is not a GitHub login. `oscar@gmail.com` pushing to `github.com/Oscar-M`
    would read as "a repository the author does not own" and that sentence would be false. TRUE
    therefore requires a STRONG identity (the gh CLI's stored login, `git config github.user`,
    or a `<login>@users.noreply.github.com` address). With only a weak one the answer is None.

No network call is needed for the negative case, and none is made at all unless `gh` is
installed, authenticated, and the local evidence is genuinely ambiguous. `AGENTGRINDER_NO_GH=1`
turns the `gh` probe off entirely.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from datetime import datetime, timedelta

# A push fired in the last seconds of a run often stamps just after the transcript's last event.
# Five minutes of grace on the closing edge keeps that push inside the window it belongs to.
PUSH_GRACE_S = 300
MAX_COMMITS_PROBED = 20      # a window with 200 commits does not need 200 `--contains` calls
NO_GH = "AGENTGRINDER_NO_GH"

# every sentence a reach cell can print on hover. No paths, no owner names, no repository names:
# these strings travel to the web app with the run.
R_NO_REPO = "not measured yet: this harness does not name the repository a session worked in, so a crossing cannot be traced"
R_NO_WINDOW = "not measured yet: this harness stamps no times on a transcript, so the session window a commit would have to land in cannot be drawn"
R_NO_COMMITS = "not measured yet: no commit landed inside this window, so nothing could have crossed"
# Added 4 Sep 2026. Cursor and Codex used to share one blanket sentence blaming the harness. Both
# halves of it were false at the object: Cursor's transcript carries absolute file paths, and
# Codex records a cwd on every session. The real causes are these, and each names a fact about
# THIS session rather than a limitation of the tool that produced it.
R_CWD_GONE = "not measured yet: the directory this session ran in is no longer on this machine, so its commits cannot be looked up"
R_CWD_NOT_REPO = "not measured yet: this session ran outside any git work tree, so there are no commits to trace"
R_NO_FILES = "not measured yet: this session wrote no file inside a git work tree, and this harness records no working directory, so the repository cannot be identified"
R_NO_REMOTE = "{n} commits, and this repository has no remote configured: the work never left this machine"
R_LOCAL_ONLY = "{n} commits, and none of them is on any remote: the work never left this machine"
R_FOREIGN = "a commit from this window is on a remote the author does not own"
R_PR = "a pull request from this window's branch is open on a repository the author does not own"
R_LATE = "not measured yet: the commits left this machine outside this run's window, so the crossing belongs to another run"
R_UNKNOWN_TIME = "not measured yet: the commits are on a remote but nothing records when they were pushed"
R_OWN_ONLY = "not measured yet: the commits reached the author's own remote only, and who read it there is not a fact on this disk"
R_NO_IDENTITY = "not measured yet: the author's account name is not on this machine (no gh login, no GitHub address), so ownership could not be compared"
R_UNKNOWN_OWNER = "not measured yet: the remote's URL does not name an owner that can be compared to the author"
R_OWNER_UNVERIFIED = "not measured yet: this window's commits are on a remote whose owner is not the author's account name, and with no signed-in gh CLI this machine cannot tell an organisation the author belongs to from another person's repository"


def _run(args: list[str], cwd: str | None = None, timeout: int = 10):
    try:
        return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        return None


def _aware(t: datetime) -> datetime:
    return t if t.tzinfo else t.astimezone()


# ---- who is the author -------------------------------------------------------
_NOREPLY = re.compile(r"^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$")
_GH_USER = re.compile(r"^\s{4,}user:\s*([A-Za-z0-9-]+)\s*$", re.M)


def _gh_hosts_logins() -> set[str]:
    """The logins the gh CLI has stored, read from its config file. No network, no `gh` needed."""
    base = os.environ.get("XDG_CONFIG_HOME") or os.path.join(os.path.expanduser("~"), ".config")
    path = os.path.join(base, "gh", "hosts.yml")
    try:
        with open(path, encoding="utf-8", errors="ignore") as fh:
            return {m.lower() for m in _GH_USER.findall(fh.read())}
    except OSError:
        return set()


def author_identities(root: str) -> tuple[set[str], bool]:
    """(every name this machine says the author answers to, whether any of them is STRONG).

    Strong = an account name, not a guess: the gh CLI's stored login, `git config github.user`,
    or the login inside a GitHub noreply address. Weak = the local part of an ordinary email,
    which is only ever used to WIDEN the set, never to justify a `True`.
    """
    strong, weak = set(), set()
    strong |= _gh_hosts_logins()
    gu = _run(["git", "-C", root, "config", "--get", "github.user"])
    if gu and gu.returncode == 0 and gu.stdout.strip():
        strong.add(gu.stdout.strip().lower())
    em = _run(["git", "-C", root, "config", "--get", "user.email"])
    if em and em.returncode == 0 and em.stdout.strip():
        addr = em.stdout.strip()
        m = _NOREPLY.match(addr)
        if m:
            strong.add(m.group(1).lower())
        elif "@" in addr:
            weak.add(addr.split("@", 1)[0].lower())
    return strong | weak, bool(strong)


# ---- who owns a remote -------------------------------------------------------
def remotes_of(root: str) -> dict[str, str]:
    """remote name -> the URL git config holds for it (NOT `git remote -v`, see the module note)."""
    out = _run(["git", "-C", root, "config", "--get-regexp", r"^remote\..*\.url$"])
    if not out or out.returncode != 0:
        return {}
    hits = {}
    for line in out.stdout.splitlines():
        key, _, url = line.strip().partition(" ")
        name = key[len("remote."):-len(".url")]
        if name and url:
            hits[name] = url.strip()
    return hits


def owner_of(url: str) -> str | None:
    """The account a remote URL belongs to, or None when the URL names no host or no owner.

    `""` is returned for a remote that is still this machine (a directory, or `file://`), which
    is a different fact from "an owner nobody can read" and is treated as such by the caller.
    """
    u = url.strip()
    if not u:
        return None
    if u.startswith("file://") or u.startswith("/") or u.startswith(".") or u.startswith("~"):
        return ""
    m = re.match(r"^(?:[a-z+]+://)?(?:[^/@]+@)?([^/:]+)[:/](.+)$", u)
    if not m or "." not in m.group(1):     # no host part: a plain relative path
        return ""
    path = m.group(2).strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    parts = [p for p in path.split("/") if p]
    return parts[-2].lower() if len(parts) >= 2 else None


# ---- when did the WORK reach the remote ---------------------------------------
# Not "when did this ref last move": a `git fetch` at the start of a session moves
# `origin/main` without carrying anything of yours, and the first version of this module read
# that as "your commits crossed inside the window". The reflog stores the ref's VALUE after each
# move, so the honest question is the first move whose value already contained one of this
# window's commits. Same lesson as gitwork.touched_since: a sentence can be true about the window
# and false about the world.
def _ref_moves(root: str, ref: str) -> list[tuple[str, datetime]]:
    """(value, when) for each recorded move of this ref, oldest first."""
    out = _run(["git", "-C", root, "reflog", "show", "--date=iso-strict", ref])
    if not out or out.returncode != 0:
        return []
    moves = []
    for line in out.stdout.splitlines():
        m = re.match(r"^([0-9a-f]+)\s.*@\{([^}]+)\}", line.strip())
        if not m:
            continue
        try:
            moves.append((m.group(1), _aware(datetime.fromisoformat(m.group(2)))))
        except ValueError:
            continue
    return list(reversed(moves))


def _contains(root: str, ancestor: str, ref_value: str) -> bool:
    out = _run(["git", "-C", root, "merge-base", "--is-ancestor", ancestor, ref_value], timeout=15)
    return bool(out and out.returncode == 0)


def arrived_at(root: str, ref: str, shas: list[str]) -> datetime | None:
    """When any of these commits FIRST appeared on this remote ref, or None if nothing says."""
    probe = shas[:5]
    for value, when in _ref_moves(root, ref)[-40:]:
        if any(_contains(root, sha, value) for sha in probe):
            return when
    return None


def _refs_containing(root: str, sha: str) -> list[str]:
    out = _run(["git", "-C", root, "branch", "-r", "--contains", sha], timeout=20)
    if not out or out.returncode != 0:
        return []
    refs = []
    for line in out.stdout.splitlines():
        name = line.strip().lstrip("* ").strip()
        if not name or "->" in name:
            continue
        refs.append(name)
    return refs


_ORGS: dict[str, tuple[set[str], bool]] = {}


def _gh_ready(root: str) -> bool:
    if os.environ.get(NO_GH) or not shutil.which("gh"):
        return False
    auth = _run(["gh", "auth", "status"], cwd=root, timeout=10)
    return bool(auth and auth.returncode == 0)


def _gh_orgs(root: str) -> tuple[set[str], bool]:
    """(the organisations the author belongs to, whether `gh` could be asked at all).

    One call per process. `False` in the second slot means the question was never put, which is a
    different fact from "the author is in no organisations" and the caller must not conflate them.
    """
    if "orgs" in _ORGS:
        return _ORGS["orgs"]
    if not _gh_ready(root):
        hit = (set(), False)
    else:
        out = _run(["gh", "api", "user/orgs", "--jq", ".[].login"], cwd=root, timeout=20)
        hit = (({o.strip().lower() for o in out.stdout.split() if o.strip()}, True)
               if out and out.returncode == 0 else (set(), False))
    _ORGS["orgs"] = hit
    return hit


def _pr_owners(root: str, branches: set[str]) -> set[str]:
    """Owners of any open pull request whose head is one of these branches. `gh` only, never fatal."""
    if not _gh_ready(root):
        return set()
    owners = set()
    for br in sorted(branches)[:4]:
        out = _run(["gh", "pr", "list", "--head", br, "--json", "url"], cwd=root, timeout=20)
        if not out or out.returncode != 0:
            continue
        for url in re.findall(r'"url"\s*:\s*"([^"]+)"', out.stdout):
            o = owner_of(url.rsplit("/pull/", 1)[0])
            if o:
                owners.add(o)
    return owners


# ---- the answer --------------------------------------------------------------
def reach_of(repo_root: str | None, since: datetime, until: datetime,
             commit_hashes: list[str] | None = None) -> tuple[bool | None, str]:
    """(reach, the sentence the card prints on hover). See the module docstring for the rule."""
    if not repo_root or not os.path.isdir(repo_root):
        return None, R_NO_REPO
    since, until = _aware(since), _aware(until)

    if commit_hashes is None:
        from . import gitwork
        commit_hashes = [c["hash"] for c in gitwork.commits_in(repo_root, since, until)]
    shas = [h for h in (commit_hashes or []) if h]
    if not shas:
        return None, R_NO_COMMITS
    n = len(shas)

    remotes = remotes_of(repo_root)
    if not remotes:
        return False, R_NO_REMOTE.format(n=n)

    owners = {name: owner_of(url) for name, url in remotes.items()}
    ident, strong = author_identities(repo_root)

    pushed_refs: set[str] = set()
    for sha in shas[:MAX_COMMITS_PROBED]:
        pushed_refs.update(_refs_containing(repo_root, sha))
    if not pushed_refs:
        return False, R_LOCAL_ONLY.format(n=n)

    late = unknown_time = unknown_owner = False
    own_branches: set[str] = set()
    for ref in sorted(pushed_refs):
        remote, _, branch = ref.partition("/")
        owner = owners.get(remote)
        if owner == "":                      # a directory on this machine: not a crossing
            continue
        arrived = arrived_at(repo_root, "refs/remotes/" + ref, shas)
        if arrived is None:
            unknown_time = True
            continue
        if not (since <= arrived <= until + timedelta(seconds=PUSH_GRACE_S)):
            late = True          # it left this machine, but not during this run
            continue
        if owner is None:
            unknown_owner = True
            continue
        if not strong:
            return None, R_NO_IDENTITY
        if owner not in ident:
            orgs, asked = _gh_orgs(repo_root)
            if not asked:
                return None, R_OWNER_UNVERIFIED
            if owner not in orgs:
                return True, R_FOREIGN
        own_branches.add(branch)     # the author's own account, or an organisation they are in

    if own_branches:
        if _pr_owners(repo_root, own_branches) - ident:
            return True, R_PR
        return None, R_OWN_ONLY
    if late:
        return None, R_LATE
    if unknown_time:
        return None, R_UNKNOWN_TIME
    if unknown_owner:
        return None, R_UNKNOWN_OWNER
    return False, R_LOCAL_ONLY.format(n=n)


# What each harness that is NOT Claude Code can supply today. Both are None, and each says why
# in its own words: a dash that names the missing fact is a pointer, a bare dash is a shrug.
# WHAT EACH HARNESS CANNOT SUPPLY, and the sentence its dash prints. Rewritten 4 Sep 2026: the
# previous two entries were measured claims that had stopped being true. Cursor's transcript does
# carry absolute file paths (2,279 of them across the 298 transcripts on the author's machine), so
# a repository can be found from the files a session wrote. Codex records a cwd in `session_meta`
# on every session and stamps an ISO timestamp on every record, so it has both a repository and a
# window. Neither harness is the reason any more; the reason is a fact about the session, and the
# parsers now pick the sentence that is actually true of it.
# Only Cursor still needs an entry. Codex records a cwd and a timestamp on every session, so its
# parser always has a fact to name and picks the exact sentence itself.
HARNESS_LIMIT = {
    "Cursor": R_NO_FILES,      # no cwd recorded, and nothing written inside a work tree
}
