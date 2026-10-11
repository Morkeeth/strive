"""THE OUTCOME SENTENCE AND THE HERO NUMBER — what the run shipped, and the one count that proves it.

The card used to open with a metric identity ("Unknown OUTPUT", "— verified per turn"). Verdict
on a real 8m19s Cursor card, 22 Sep 2026: nobody would share it. A stranger cannot tell from a
ratio whether anything happened, and four of the five cells under it were em-dashes.

So the largest sentence on a card is now an OUTCOME, taken from the run in this order:

  1. the outcome the author declared with a receipt beside it       (declared, and labelled so)
  2. the subject of a commit git recorded inside this run's window  (measured)
  3. the commits counted in this run when no subject could be read  (measured)
  4. a pull request, screenshot or output link the author attached  (declared, and labelled so)
  5. the author's own line with no receipt behind it                (declared, and labelled so)

and when none of those exists the card says `No shipped output recorded` and names what was
measured instead. There is no sixth rung. A run with nothing to show says so: inventing a
sentence for it is the one failure this card cannot recover from.

THE HERO NUMBER is the single count the run can prove, in the same spirit: checks passing,
commits landed, files changed, then the tool calls the trace is already drawn from. A run that
can prove none of them gets no hero block at all — never a dash, never a zero nobody measured.
"""
from __future__ import annotations

from dataclasses import dataclass

from . import privacy

NOTHING_SHIPPED = "No shipped output recorded"
MAX_LINE = 120


@dataclass(frozen=True)
class Outcome:
    """One sentence, and the provenance a reader can check it against."""

    text: str
    basis: str
    shipped: bool
    measured: bool = False


@dataclass(frozen=True)
class Hero:
    """The one number the run can prove. An empty hero draws nothing."""

    value: str = ""
    label: str = ""
    source: str = ""

    def __bool__(self) -> bool:
        return bool(self.value)


def _count(value) -> int | None:
    return value if type(value) is int and value >= 0 else None


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" + ("" if n == 1 else "s")


def _clean(line) -> str:
    """A line of text that is safe to print on a card, or "". Never a truncated path."""
    if not isinstance(line, str):
        return ""
    text = privacy.strip_home_names(" ".join(line.split()))
    if not text or privacy.scan(text):
        return ""
    return text[:MAX_LINE].rstrip()


def _declared(run: dict) -> dict:
    from .contract import public_outcome

    try:
        return public_outcome(run)
    except ValueError:
        return {}


def _repo(run: dict) -> str:
    """The repository name, only when git proved it. A workspace label is not a repository."""
    if run.get("project_proven") is False:
        return ""
    return _clean(run.get("project"))


def _commit_subject(run: dict) -> str:
    """The subject of the last commit git recorded inside this run's window."""
    commits = run.get("commits_list")
    if isinstance(commits, list) and commits:
        rows = [c for c in commits if isinstance(c, dict) and c.get("subject")]
        if rows:
            rows.sort(key=lambda c: str(c.get("at") or ""))
            return _clean(rows[-1]["subject"])
    return _clean(run.get("commit_subject"))


def _link_label(url: str) -> str:
    lowered = url.lower().split("?", 1)[0]
    if "/pull/" in lowered and "github.com/" in lowered:
        return "Pull request"
    if lowered.endswith((".png", ".jpg", ".jpeg", ".webp")):
        return "Screenshot"
    return "Output"


def outcome_of(run: dict) -> Outcome:
    """The one outcome sentence for a run. Never invented: see the ladder in the module note."""
    if not isinstance(run, dict):
        return Outcome(NOTHING_SHIPPED, "no run data was recorded", False)
    declared = _declared(run)
    shipped = [line for line in (_clean(x) for x in declared.get("shipped") or []) if line]
    receipts = [r for r in declared.get("receipts") or [] if isinstance(r, dict) and r.get("url")]

    if shipped and receipts:
        return Outcome(shipped[0], "declared by the author, with a receipt linked", True)

    subject = _commit_subject(run)
    commits = _count(run.get("commits"))
    repo = _repo(run)
    if subject:
        basis = ("last of " + _plural(commits, "commit") + " git recorded in this run's window"
                 if commits and commits > 1 else "commit subject, read from git over this run's window")
        return Outcome(subject, basis, True, measured=True)
    if commits:
        return Outcome(_plural(commits, "commit") + " landed" + (f" in {repo}" if repo else ""),
                       "git commits counted in this run", True, measured=True)

    url = run.get("output_url") or (receipts[0]["url"] if receipts else "")
    if isinstance(url, str) and url.strip():
        return Outcome(f"{_link_label(url)} linked to this run",
                       "link declared by the author; this card did not verify it", True)
    if shipped:
        return Outcome(shipped[0], "declared by the author; no receipt is linked", True)

    changed = _count(run.get("files_changed")) or _count(run.get("files_edited"))
    if changed:
        return Outcome(NOTHING_SHIPPED,
                       _plural(changed, "file") + " changed, and no commit, pull request or "
                       "artifact was recorded", False)
    return Outcome(NOTHING_SHIPPED,
                   "no commit, pull request or shipped artifact was recorded in this run", False)


def hero_of(run: dict) -> Hero:
    """The one count the run can prove, or an empty hero. Order: checks, commits, files, calls."""
    if not isinstance(run, dict):
        return Hero()
    def hero(count, one: str, many: str, source: str) -> Hero:
        return Hero(f"{count:,}", one if count == 1 else many, source)

    checks = _count(run.get("checks_passed"))
    if checks:
        return hero(checks, "check passing", "checks passing",
                    "checks this run recorded as passing")
    commits = _count(run.get("commits"))
    if commits:
        return hero(commits, "commit landed", "commits landed",
                    "git commits measured in this run")
    for key in ("files_changed", "files_edited"):
        changed = _count(run.get(key))
        if changed:
            return hero(changed, "file changed", "files changed",
                        "files this run wrote, counted from the transcript")
    touched = _count(run.get("files_touched"))
    if touched:
        return hero(touched, "file touched", "files touched", "files this run opened or wrote")
    calls = _count(run.get("tool_calls")) or _count(run.get("ridge_tool_calls"))
    if calls:
        return hero(calls, "tool call", "tool calls", "tool calls counted in this run")
    return Hero()
