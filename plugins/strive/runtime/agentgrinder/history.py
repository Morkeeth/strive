"""YOUR OWN HISTORY — the part that makes it Strava and not a viewer.

A card that only describes today is a log. Strava's loop is *progression*: this run against every
run you have logged. The same thing is available here and nobody is showing it, because the raw
material -- every sitting you have ever had with a coding agent -- is already sitting on the disk
in `~/.claude/projects`.

So: one pass over every transcript, split into sittings by the same 30-minute idle rule the card
uses, and a small record per sitting. A rank is then a TRUE rank of a real population, printed
with its size -- "3rd of 604 grinds", never "personal best!" with nothing behind it.

The pass is cached in `~/.agentgrinder/history.json`, keyed by each file's path, size and mtime,
so the second run reads only what changed. Nothing leaves the machine, and nothing reads the file
but `agentgrinder history`.

Its VALUES are counts and timestamps -- `at, typed, moving_s, tools, edits, stretch_s,
stretch_tools` -- never a path inside a repository, never a line of a prompt. Its KEYS are the
transcript paths, and Claude Code encodes the working directory into those, so the file does name
the directories you have worked in: 1,369 keys naming 1,055 distinct project-dir names on this
machine (read 31 Aug). This docstring said only the first half until 31 Aug, which is the same
sentence the README had to be corrected for -- the check was run on the values and the claim was
made about the file.
"""
from __future__ import annotations

import glob
import json
import os
from datetime import datetime

from .solo import SITTING_GAP, _scan, _moving, longest_stretch, sittings

CACHE = os.path.expanduser("~/.agentgrinder/history.json")


def _digest(path: str) -> str:
    st = os.stat(path)
    return f"{st.st_size}:{int(st.st_mtime)}"


def _sittings_of(path: str) -> list[dict]:
    s = _scan(path)
    out = []
    for lo, hi in sittings(s["all_ts"], SITTING_GAP):
        typed = [t for t in s["typed"] if lo <= t <= hi]
        if not typed:
            continue
        t0 = typed[0]
        ev = [e for e in s["all_ts"] if t0 <= e <= hi]
        tools_in = [e for e in s["tool_ts"] if t0 <= e <= hi]
        st = longest_stretch(typed, ev, hi, tools_in)
        out.append(dict(
            at=t0.isoformat(), typed=len(typed), moving_s=_moving(ev),
            tools=len(tools_in),
            edits=len({p for ts_, p, k in s["visits"] if t0 <= ts_ <= hi and k == "edit"}),
            stretch_s=(st["active_s"] if st else 0),
            stretch_tools=(st["tools"] if st else 0)))
    return out


def load(refresh: bool = True) -> list[dict]:
    """Every sitting on this machine, newest last. Cached; only changed transcripts are re-read."""
    cache = {}
    try:
        cache = json.load(open(CACHE))
    except (OSError, ValueError):
        pass
    files = glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl"))
    out, changed = [], False
    for f in files:
        try:
            d = _digest(f)
        except OSError:
            continue
        hit = cache.get(f)
        if hit and hit.get("digest") == d:
            out.extend(hit["sittings"])
            continue
        if not refresh:
            continue
        try:
            sits = _sittings_of(f)
        except (OSError, ValueError):
            sits = []
        cache[f] = dict(digest=d, sittings=sits)
        out.extend(sits)
        changed = True
    if changed:
        try:
            os.makedirs(os.path.dirname(CACHE), exist_ok=True)
            json.dump(cache, open(CACHE, "w"))
        except OSError:
            pass
    out.sort(key=lambda r: r["at"])
    return out


def rank(run: dict, hist: list[dict]) -> dict:
    """This grind's place in the population, on each measure -- and the population's size.

    The grind being ranked is EXCLUDED from the comparison set by its own start time, so it is
    never counted as one of the grinds it is being compared to.
    """
    others = [h for h in hist if h["at"] != run["started"]]
    n = len(others)
    if n < 10:
        return dict(n=n, enough=False)

    def place(value, key):
        better = sum(1 for h in others if h[key] > value)
        return better + 1

    st = run.get("stretch") or {}
    return dict(
        n=n, enough=True,
        prompts=place(run["turns_typed"], "typed"),
        moving=place(run["duration_s"], "moving_s"),
        tools=place(run["tool_calls"], "tools"),
        edits=place(run["files_edited"], "edits"),
        stretch=place(st.get("active_s", 0), "stretch_s"),
        stretch_s=st.get("active_s", 0),
    )


# The stretch measure ranks `stretch_s`, which is the agent's MOVING time inside the longest span
# nobody typed through -- not the width of that span. The card prints the span's wall width under
# the noun "minutes without touching the keyboard" (see solocard.headline), so this label has to
# name the other number, or the same word would stand for two different quantities.
MEASURES = [("stretch", "agent time inside the longest no-typing span"),
            ("moving", "moving time"), ("tools", "tool calls"),
            ("edits", "files changed"), ("prompts", "prompts typed")]


def best_rank(r: dict) -> tuple[int, int, str] | None:
    """(place, population, what it is the place FOR) — the strongest true rank, always shown."""
    if not r.get("enough"):
        return None
    k, label = min(MEASURES, key=lambda c: r[c[0]])
    return (r[k], r["n"] + 1, label)


def badge(r: dict) -> tuple[str, str] | None:
    """A badge when ANY ONE of the five measures clears that measure's top-2% bar (or top 3).

    A badge that fires on every card is decoration, and the brand book's rule is that a badge
    fires only when the bar is actually cleared. At 625 grinds the per-measure bar is 12th place.

    But five bars is not one bar, and "a badge only fires in the top 2%" -- which the README and
    hack.md both carried until 31 Aug -- is a true statement about the CUT and a false one about
    the BADGE. Replayed over every sitting on this machine it fires on **34 of 625, 5.4%**
    (by measure: stretch 10, edits 9, tools 6, prompts 6, moving 3). If that is ever tightened,
    tighten it here and re-run the replay -- do not re-word the docs.
    """
    if not r.get("enough"):
        return None
    cut = max(3, int(r["n"] * 0.02))
    best = min((c for c in MEASURES if r[c[0]] <= cut), key=lambda c: r[c[0]], default=None)
    if not best:
        return None
    k, label = best
    return (f"#{r[k]} of {r['n'] + 1}", label)
