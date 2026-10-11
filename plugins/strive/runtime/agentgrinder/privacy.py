"""THE PRIVACY RULE — what a card may print, and the control that fails the build when it doesn't.

Why this file exists
--------------------
A grind card is built out of one person's local machine. Every row label started life as an
absolute path on that machine, every headline started life as a sentence they typed. The old
renderer's only path treatment was `_shorten`, and `_shorten` was written for READABILITY, not for
privacy — it swapped `$HOME` for `~` and, when a path was still too long, kept THE LAST TWO
SEGMENTS. That is exactly backwards: it drops the harmless prefix and keeps the identifying tail.
Shipped cards printed, as row labels: two files from the agent's own memory directory, a note
from a synced-notes vault, an absolute path under the author's home, and — inside a repo whose
relative filenames are themselves the secret — four filenames naming two companies the author
was applying to.

The specific strings are deliberately NOT quoted here. An earlier draft of this docstring listed
them, which made this file, the one file whose whole job is to stop private names being printed,
the place where four of them were written down in tracked source. The evidence lives in
PRIVACY-2026-08-31.md with its commit shas; a rule does not need to repeat the secret to state
the rule.

The rule is POSITIVE, not a blocklist
-------------------------------------
`safe_label` decides what MAY appear. Anything it does not have a rule for degrades to a shape
word, never to a filename. A blocklist of bad strings fails the day a new bad string appears;
a positive rule fails closed.

    in the grind's own repo        ->  the path relative to the repo root        ("docs/PRD.md")
    in ANOTHER git repo            ->  that repo's NAME only, no file            ("morning-page")
    anywhere else on the machine   ->  a shape word, no basename                 ("elsewhere")
    a typed prompt                 ->  nothing, unless opt_in is passed

The in-repo case is the one real judgement call. A relative path inside the repo you are grinding
on is the content of the card — a card that cannot say `docs/PRD.md` has nothing to show. It is
still capable of leaking (see repo C above), which is why `safe_label` refuses a repo-relative
path that itself contains a home marker or a memory basename, and why the CARD-LEVEL control below
runs over the finished HTML regardless of which branch produced each label.

The control (`scan` / `assert_clean`)
-------------------------------------
Reads the rendered HTML — the artefact, not the source — and returns a finding for every home
path, synced-notes path, agent-config path, email address, or basename taken live from the memory
directory. It is the deliverable that outlives any one renderer fix: it does not know or care how
the label was produced.

Two deliberate properties:

* **The patterns are assembled at run time from fragments.** If they were written as literals this
  file would match itself, every scan of the repo's own source would be red, and the first thing
  anyone would do is add a carve-out for it. There are NO carve-outs. A control with an exception
  list is a control that will be taught to forgive the next real leak.
* **The memory basenames are read from disk at check time**, not baked in. A file added to the
  memory directory tomorrow is covered tonight without editing this file.

Run it:

    python3 -m agentgrinder privacycheck grind.html archive/hackathon-2026-09/docs/shots/six/*.html
"""

from __future__ import annotations

import glob
import os
import re

# --------------------------------------------------------------------------------------------
# the positive rule
# --------------------------------------------------------------------------------------------

ELSEWHERE = "elsewhere on this machine"


def _home() -> str:
    return os.path.expanduser("~").rstrip("/")


def _repo_name_of(path: str) -> str | None:
    """The name of the git repository `path` sits in, or None.

    Walks up looking for a `.git` entry. Returns the DIRECTORY NAME only — never the route to it,
    so a repo living under a private parent directory does not carry that parent into the label.
    """
    d = os.path.dirname(os.path.abspath(path))
    home = _home()
    while d and d != "/":
        if os.path.exists(os.path.join(d, ".git")):
            return os.path.basename(d)
        if d == home:                      # never walk above the user's home
            return None
        d = os.path.dirname(d)
    return None


def safe_label(path: str, repo_root: str | None, opt_in: bool = False) -> tuple[str, str]:
    """Return (label, kind) for a file this grind touched.

    kind is one of: "in_repo", "other_repo", "elsewhere" — the card uses it to word the note
    beside the label, so a reader can tell a hidden path from a shown one.

    `opt_in=True` is the escape hatch for someone grinding in public on purpose; it still never
    prints an absolute home path, it only allows the outside-repo BASENAME through.
    """
    p = os.path.abspath(path)
    if repo_root and p.startswith(os.path.abspath(repo_root).rstrip("/") + "/"):
        rel = os.path.relpath(p, repo_root)
        # A repo-relative path can still be the secret (a job-hunt repo whose filenames are
        # company names is the case that produced this rule). If the relative path trips the
        # card-level control, it does not get to be a label just because it is relative.
        if not scan(rel):
            return rel, "in_repo"
        return ELSEWHERE, "elsewhere"

    name = _repo_name_of(p)
    if name and not scan(name):
        if opt_in:
            base = os.path.basename(p)
            cand = f"{name}/{base}"
            if not scan(cand):
                return cand, "other_repo"
        return name, "other_repo"

    if opt_in:
        base = os.path.basename(p)
        if base and not scan(base):
            return base, "elsewhere"
    return ELSEWHERE, "elsewhere"


# A home directory reaches a label in two shapes: as a path (`/Users/<name>/code/app`) and as the
# flattened directory name Cursor and Claude write for a workspace (`Users-<name>-code-app`). The
# first is what `scan` already refuses. The second passed every control for months and reached a
# real shared card as the run's title, because a card title is not a file path to any regex here.
_HOME_PATH = re.compile(r"(?:/" + "Us" + "ers|/home)/[A-Za-z0-9._-]+" + r"|~/[^\s<>\"']*")
_AT_TOKEN = r"(?:^|(?<=[\s·|/(\[]))"
# macOS flattens `/Users/<name>/...`; the word is rare enough in prose to strip on sight.
_HOME_FLAT_MAC = re.compile(_AT_TOKEN + r"-?" + "Us" + r"ers-[A-Za-z0-9._]+-?")
# Linux flattens `/home/<name>/...`. `home-` IS ordinary English ("home-page"), so the Linux
# shape is only stripped where a flattened path is unmistakable: a leading dash from the
# absolute path, or a third segment after the account name.
_HOME_FLAT_LINUX = re.compile(
    _AT_TOKEN + r"(?:-home-[A-Za-z0-9._]+-?|home-[A-Za-z0-9._]+-(?=[A-Za-z0-9._]))")


def strip_home_names(text: str) -> str:
    """Remove the operating-system home directory, and the username inside it, from a label.

    The card may print a repository, a commit subject or a project name. None of those needs the
    machine's own account name, and the account name is the one string on a run card that
    identifies a person who did not choose to be identified.
    """
    if not isinstance(text, str) or not text:
        return text
    out = _HOME_PATH.sub("", text)
    out = _HOME_FLAT_LINUX.sub("", _HOME_FLAT_MAC.sub("", out))
    # The account name is only stripped where a home directory put it. A repository that carries
    # a person's name is that person's public identity, and deleting it would be its own defect.
    return " ".join(out.replace("··", "·").split()).strip(" ·-/")


def safe_prompt(prompt: str | None, opt_in: bool = False) -> str | None:
    """A typed prompt is a keystroke log. It is never printed unless it is opted in.

    There is no "safe" transform of a sentence someone typed: the leak in the shipped cards was
    the sentence itself, not a path inside it — two typed sentences reached shipped screenshots
    verbatim, and one of them contained a path as well. So the default is to drop it, and the
    opt-in still passes the result through `scan`.
    """
    if not opt_in or not prompt:
        return None
    line = " ".join(prompt.split())
    line = (line[:64] + "…") if len(line) > 64 else line
    return None if scan(line) else line


# --------------------------------------------------------------------------------------------
# the control
# --------------------------------------------------------------------------------------------

def _patterns() -> list[tuple[str, re.Pattern]]:
    """Assembled from fragments at run time so this file does not match itself.

    Order matters only for reporting; every pattern is applied to every line.
    """
    u, s = "Us" + "ers", "/"
    home = _home()
    pats: list[tuple[str, re.Pattern]] = [
        # the literal home directory of whoever is running the check
        ("home-abs", re.compile(re.escape(home) + r"(?![A-Za-z0-9])" + r"[^<>\"'\n]{0,70}")),
        # anybody's absolute home path, so a card shot on another machine is covered too
        ("home-any", re.compile(s + u + s + r"[A-Za-z0-9._-]+" + s + r"[^<>\"'\n]{0,70}")),
        # a tilde path: `~/` followed by anything that is not just the bare tilde
        ("home-tilde", re.compile(r"~" + s + r"[A-Za-z0-9._\-][^<>\"'\n]{0,70}")),
        ("icloud", re.compile("i" + "Cloud" + r"[~A-Za-z0-9]*" + "obs" + "id", re.I)),
        ("notes-vault", re.compile("Obs" + "id" + "ian", re.I)),
        ("claude-dir", re.compile(r"\." + "clau" + "de" + s + r"[^<>\"'\n]{0,60}")),
        ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
        # THE ELIDED PATH. The retired `_shorten` printed an out-of-repo file as its last two
        # segments behind a leading "\u2026/". That form carries NO home marker and NO tilde, so
        # every other pattern here misses it: this control passed
        # a synced-notes path in that shape -- while
        # while correctly failing a memory path on the row above it, purely because the second
        # one happened to carry a memory filename. Caught on 31 Aug by looking at what a card
        # actually printed instead of trusting the finding count.
        # The fixed renderer never emits this marker, so its presence in a card is, by
        # construction, a private path that was truncated rather than withheld.
        ("elided-path", re.compile("\u2026" + s + r"[^<>\"'\n]{0,70}")),
    ]
    return pats


def _memory_basenames() -> set[str]:
    """Every filename in every `memory/` directory under the Claude projects tree, read NOW.

    These are the highest-value leak in the whole set: a memory filename is a sentence about its
    owner — the names alone disclose employment status, medical detail, or who someone is talking
    to, with no need to open the file. Read live so the control covers files that did not exist
    when it was written, and so no example has to be written down here.
    """
    out: set[str] = set()
    root = os.path.join(_home(), "." + "clau" + "de", "projects")
    for f in glob.glob(os.path.join(root, "*", "memory", "*")) + \
             glob.glob(os.path.join(root, "*", "memory", "*", "*")):
        # The glob also returns directories. Their generic labels are not memory filenames;
        # files inside those directories remain covered by the second glob above.
        if not os.path.isfile(f):
            continue
        b = os.path.basename(f)
        if len(b) > 6:                      # a 1-6 char basename is not identifying on its own
            out.add(b)
    return out


_TAG = re.compile(r"<[^>]+>")
_ENT = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " "}


def _visible(html: str) -> str:
    """The text a reader sees. Checked ALONGSIDE the raw source, never instead of it.

    A leak hidden in an attribute (a title=, an SVG <text> that is clipped, a data- payload) is
    still a leak in a file someone can open, so `scan` runs over both.
    """
    t = _TAG.sub(" ", html)
    for k, v in _ENT.items():
        t = t.replace(k, v)
    return t


def scan(text: str, *, memory: set[str] | None = None) -> list[tuple[str, str]]:
    """Return [(rule, matched-text), ...]. Empty list means clean.

    Takes plain text. `scan_html` is the wrapper that also strips tags.
    """
    found: list[tuple[str, str]] = []
    for name, rx in _patterns():
        for m in rx.finditer(text):
            found.append((name, m.group(0)))
    mem = _memory_basenames() if memory is None else memory
    for b in mem:
        if b in text:
            found.append(("memory-filename", b))
    return found


def scan_html(html: str) -> list[tuple[str, str]]:
    mem = _memory_basenames()
    found = scan(html, memory=mem)
    found += [f for f in scan(_visible(html), memory=mem) if f not in found]
    return found


class PrivacyLeak(AssertionError):
    pass


def assert_clean(html: str, where: str = "card") -> None:
    """Raise on the first rendered card that leaks. This is what fails the build."""
    found = scan_html(html)
    if found:
        seen, lines = set(), []
        for rule, hit in found:
            if (rule, hit) in seen:
                continue
            seen.add((rule, hit))
            lines.append(f"    {rule:<16} {hit[:90]}")
        raise PrivacyLeak(
            f"{where}: {len(seen)} private string(s) would be printed on this card:\n"
            + "\n".join(lines[:40])
            + ("\n    ..." if len(lines) > 40 else "")
        )


def check_files(paths: list[str]) -> int:
    """CLI body. Prints a line per file and returns the number of files that leaked."""
    mem = _memory_basenames()
    print(f"\n  privacy control — {len(_patterns())} patterns + "
          f"{len(mem)} live memory basenames, over {len(paths)} file(s)\n")
    bad = 0
    for p in paths:
        try:
            text = open(p, encoding="utf-8", errors="replace").read()
        except OSError as e:
            print(f"  SKIP  {p}  ({e.strerror})")
            continue
        # AN EMPTY FILE IS NOT A CLEAN FILE. Found by this control calling a 0-byte card "ok"
        # on 31 Aug: the renderer had raised, nothing was written, and the check reported a pass
        # on a file that did not exist. A control whose green light also means "there was
        # nothing to look at" is the false negative nobody audits.
        #
        # Empty FAILS. Merely small only WARNS: the first version failed anything under 2 KB,
        # which red-flagged site/terms.html -- a legitimately short legal page that is not a card
        # at all. A control that cries wolf on real files is one that gets switched off.
        if not text.strip():
            bad += 1
            print(f"  EMPTY {p}   0 bytes -- a pass here would mean nothing")
            continue
        if p.endswith((".html", ".htm", ".svg")) and len(text) < 2000:
            print(f"  small {p}   {len(text)} bytes -- scanned, but too small to be a card; "
                  f"check you passed the file you meant")
        found = scan_html(text) if p.endswith((".html", ".htm", ".svg")) else scan(text, memory=mem)
        if not found:
            print(f"  ok    {p}")
            continue
        bad += 1
        uniq: list[tuple[str, str]] = []
        for f in found:
            if f not in uniq:
                uniq.append(f)
        print(f"  LEAK  {p}   {len(uniq)} distinct")
        for rule, hit in uniq[:12]:
            print(f"          {rule:<16} {hit[:88]}")
        if len(uniq) > 12:
            print(f"          ... and {len(uniq) - 12} more")
    print(f"\n  {len(paths) - bad} clean, {bad} leaking\n")
    return bad
