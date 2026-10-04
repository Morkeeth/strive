"""ONE ORDINARY SESSION — the wide door.

`nightrun` draws a fleet. Almost nobody runs a fleet. Almost everybody has ONE session open in
one repo on one afternoon, and that session has a shape too. This module reads it.

THE SAME DRAWING GRAMMAR, ONE SCALE DOWN. The night-run route is: rows are PLACES, ordered by
first arrival; time runs left to right; the human's typed turns are ticks on a trunk above;
commits are ticks on the row of the place they landed in; and one line of the drawing is a real
maximum, not a decoration. Every one of those survives at solo scale with one substitution:

    fleet: a place is a REPOSITORY   ·   solo: a place is a FILE

That substitution is a measurement, not a preference. `NIGHTRUN-2026-08-31.md` decision 2 killed
a 2-D map of the codebase because only 3 of 16 lanes ever moved between regions -- true, and about
the FLEET population, which says nothing about a solo session whose entire shape is movement
between files. Probed before building, over every session under `~/.claude/projects` carrying at
least one human turn (194 of 1,369 files, 31 Aug ~04:5x):

    edited files per session      min 0 · p25 3 · median 10 · p75 19 · max 69
    top-level regions per session min 0 · p25 1 · median  2 · p75  3 · max  6

Two regions is a list, not a map. Ten files is a route. So rows are files, capped at the busiest
`MAX_ROWS` with the remainder collapsed into one honest summary row, and READ visits are drawn as
a second, lighter mark class -- because 2 of the 5 most recent human sessions edited nothing at
all and read 21 and 31 files, and a card that draws only edits would tell those sessions they did
not happen.

WHAT THE SOLO CARD CAN PROVE THAT THE FLEET CARD CANNOT. `git log --name-only` names the files in
each commit, and a solo session has one author, so a commit tick sits on the row of every file it
actually contains. The fleet card had to keep commits on their own unattributed rail; here the
attribution is git's, not a guess.

THE HEADLINE IS THE SAME FACT, MEASURED THE SAME WAY. The fleet card's title is the handoff: the
last minute a person typed, and what ran after it. Its solo analogue is the LONGEST stretch with
nobody at the keyboard -- and on a night run the longest stretch IS the final handoff, so this is
one measurement that fits both. It is ranked by AGENT-ACTIVE time (gaps between the agent's own
events, each capped at IDLE_CAP), never by wall clock: an hour where the person went to lunch and
the agent sat idle is a gap, not a stretch, and crowning it would be the flattering lie.
"""
from __future__ import annotations

import glob
import json
import os
from datetime import datetime, timedelta

from .authorship import CATEGORIES, classify, is_human_turn
from .claims import ClaimTracker, is_tool_result, result_text
from . import gitwork, privacy, reach as reachmod

EDIT_TOOLS = {"Edit", "Write", "NotebookEdit"}
READ_TOOLS = {"Read", "NotebookRead"}
IDLE_CAP = 1200          # 20 min: the same moving-time rule the v1 card used
MERGE_GAP = 240          # visits to one file this close are one stretch of work on it
MAX_ROWS = 14            # from the sitting probe: p90 touches 15 files, so ~90% of runs fit whole
SITTING_GAP = 1800       # 30 min with NOTHING happening ends a run -- the fleet card's own rule


def _ts(o: dict):
    t = o.get("timestamp")
    if not t:
        return None
    try:
        return datetime.fromisoformat(t.replace("Z", "+00:00")).astimezone()
    except ValueError:
        return None


def _text(msg: dict) -> str:
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
    return ""


def latest_session() -> str | None:
    files = glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl"))
    return max(files, key=os.path.getmtime) if files else None


def latest_grind(scan: int = 40) -> tuple[str, int] | None:
    """(transcript, sitting index) for the most recent sitting a person actually sat through.

    Scans the newest transcripts by mtime rather than the newest file, because on this machine
    the newest files are usually subagent lanes with no human turn in them at all: of the 60
    most recently written transcripts, 55 carried none.
    """
    files = sorted(glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")),
                   key=os.path.getmtime, reverse=True)[:scan]
    best = None
    for f in files:
        try:
            sits = human_sittings(f)
        except (OSError, ValueError):
            continue
        if not sits:
            continue
        end = sits[-1]["end"]
        if best is None or end > best[0]:
            best = (end, f, -1)
    return (best[1], best[2]) if best else None


def _scan(path: str) -> dict:
    """One transcript -> raw events, every one carrying its timestamp so any window can be cut
    from it later without reading the file twice. Nothing is interpreted here."""
    typed, all_ts, visits, bash, cwds = [], [], [], [], []
    tool_ts, user_cats, prompt_at = [], [], {}
    # (ts, kind, text) for the v0 claim rule (claims.py): kind is "typed" / "text" / "result".
    # Text is held only long enough to be replayed over ONE sitting; counts alone leave.
    claim_ev = []
    first_prompt = None
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = _ts(o)
            if ts:
                all_ts.append(ts)
            if o.get("cwd") and ts:
                cwds.append((ts, o["cwd"]))
            cat = classify(o)
            if cat and ts:
                user_cats.append((ts, cat))
            if is_human_turn(o):
                if ts:
                    typed.append(ts)
                    claim_ev.append((ts, "typed", ""))
                    txt = _text(o.get("message") or {}).strip()
                    if txt:
                        prompt_at[ts] = txt
                if first_prompt is None:
                    first_prompt = _text(o.get("message") or {}).strip() or None
            elif is_tool_result(o):
                if ts:
                    claim_ev.append((ts, "result", result_text(o)))
            elif o.get("type") == "assistant":
                if ts:
                    atext = _text(o.get("message") or {})
                    if atext.strip():
                        claim_ev.append((ts, "text", atext))
                for b in (o.get("message") or {}).get("content") or []:
                    if not (isinstance(b, dict) and b.get("type") == "tool_use"):
                        continue
                    if ts:
                        tool_ts.append(ts)
                    name, inp = b.get("name", ""), (b.get("input") or {})
                    fp = inp.get("file_path") or inp.get("notebook_path")
                    if fp and ts:
                        if name in EDIT_TOOLS:
                            visits.append((ts, os.path.abspath(fp), "edit"))
                        elif name in READ_TOOLS:
                            visits.append((ts, os.path.abspath(fp), "read"))
                    elif name == "Bash" and ts:
                        bash.append((ts, (inp.get("command") or "")[:120]))
    return dict(typed=sorted(typed), all_ts=sorted(all_ts),
                visits=sorted(visits, key=lambda v: v[0]),
                bash=bash, cwds=cwds, tool_ts=sorted(tool_ts), user_cats=user_cats,
                prompt_at=prompt_at, first_prompt=first_prompt, claim_ev=claim_ev,
                counts={c: 0 for c in CATEGORIES}, tool_calls=len(tool_ts), user_records=0)


def _moving(events: list[datetime]) -> int:
    """Strava's moving time: sum the gaps, but a gap over IDLE_CAP means you stepped away."""
    return int(sum(min((b - a).total_seconds(), IDLE_CAP) for a, b in zip(events, events[1:])))


def sittings(events: list[datetime], gap: int = SITTING_GAP) -> list[tuple[datetime, datetime]]:
    """Split a transcript into RUNS. A `.jsonl` file is a terminal, not a sitting.

    This was found by probing, and it is the single biggest correctness fact about the solo path.
    Measured over every transcript under `~/.claude/projects` (re-run 31 Aug ~06:4x, 1,370
    files): **151 of the 194 files carrying a human turn contain more than one sitting** at a
    30-minute idle gap; the median file holds 3. An earlier pass the same night wrote `171 …
    median 5`; neither number reproduces against this splitter, so both were replaced rather
    than averaged. Re-run it with `human_sittings` over `~/.claude/projects/*/*.jsonl`. One of them, `e374eaf3`, spans 13h26m and 1,789 records while all 12 of
    its human turns fall in the last 45 minutes -- a terminal a fleet peer drove all afternoon
    before a person sat down at it. The v1 card measured `min(typed) -> max(record)` over the
    whole file, so for that transcript it would have drawn 45 minutes of work as 13 hours, and
    counted 80 file visits that happened before the person arrived.

    The fleet card already ruled this for the night run ("a run is a contiguous burst; 30 min of
    total idle ends it"). The solo card obeys the same rule, at the same gap, so the two surfaces
    cannot disagree about where a run begins.
    """
    if not events:
        return []
    out = [[events[0], events[0]]]
    for a, b in zip(events, events[1:]):
        if (b - a).total_seconds() > gap:
            out.append([b, b])
        else:
            out[-1][1] = b
    return [(a, b) for a, b in out]


def human_sittings(path: str, gap: int = SITTING_GAP) -> list[dict]:
    """Every sitting in one transcript that a person actually sat through, newest last."""
    s = _scan(path)
    out = []
    for a, b in sittings(s["all_ts"], gap):
        typed = [t for t in s["typed"] if a <= t <= b]
        if not typed:
            continue
        ev = [t for t in s["all_ts"] if a <= t <= b]
        # a sitting is reported from the first turn the PERSON typed, which is where the card
        # starts the run: agent work that ran into the sitting before they sat down is not theirs
        out.append(dict(start=typed[0], end=b, typed=len(typed),
                        events=len([e for e in ev if e >= typed[0]]),
                        minutes=(b - typed[0]).total_seconds() / 60))
    return out


def longest_stretch(typed: list[datetime], events: list[datetime], t_end: datetime,
                    tool_ts: list[datetime] | None = None) -> dict | None:
    """The longest stretch with nobody typing, ranked by the agent's ACTIVE time inside it.

    Boundaries are real timestamps. `active_s` is moving time inside the stretch, so a lunch break
    cannot win: the agent's own events have to be there.

    `tool_calls` is counted from the TOOL timestamps, never from the record count. The first
    version of this returned `len(inside)` -- every record in the window -- under the name
    `tool_calls`, and the card printed "375 tool calls" for a stretch that made **75**. An
    independent control that never imports this package caught it; the tests would not have,
    because both numbers are correct counts of something. A count is only as true as its noun.
    """
    if not typed:
        return None
    tool_ts = tool_ts if tool_ts is not None else []
    bounds = list(zip(typed, typed[1:] + [t_end]))
    best = None
    for a, b in bounds:
        inside = [e for e in events if a < e <= b]
        if len(inside) < 2:
            continue
        active = _moving([a] + inside)
        if best is None or active > best["active_s"]:
            best = dict(start=a, end=b, wall_s=int((b - a).total_seconds()),
                        active_s=active, records=len(inside),
                        tools=len([e for e in tool_ts if a < e <= b]))
    return best


def parse_solo(path: str, athlete: str = "you", pick: int = -1, gap: int = SITTING_GAP,
               show_paths: bool = False) -> dict:
    """One SITTING out of one transcript -> a grind.

    `pick` selects among the sittings a human sat through, oldest first. It is ONE-BASED when
    positive, because that is what `grind --list` prints next to each row, and Python-style when
    negative, so the default -1 stays "the sitting I just finished". Zero-based indexing here
    made `--pick 2` render the third sitting while the listing said it was the second -- a
    one-character mismatch between two surfaces of the same command, found by running it.
    """
    s = _scan(path)
    if not s["typed"]:
        raise ValueError(f"no human turns in {path} (every type:user record was tool output, "
                         f"injected context or a harness envelope)")
    windows = [(a, b) for a, b in sittings(s["all_ts"], gap) if any(a <= t <= b for t in s["typed"])]
    if not windows:
        raise ValueError(f"no sitting in {path} contains a human turn")
    if pick > 0:
        idx = pick - 1
    elif pick < 0:
        idx = len(windows) + pick
    else:
        idx = len(windows) - 1
    if not 0 <= idx < len(windows):
        raise ValueError(f"--pick {pick}: this transcript has {len(windows)} sitting"
                         f"{'' if len(windows) == 1 else 's'} you sat through")
    lo, hi = windows[idx]
    typed_all = s["typed"]
    s["typed"] = [t for t in typed_all if lo <= t <= hi]
    t0 = s["typed"][0]
    events = [e for e in s["all_ts"] if t0 <= e <= hi]
    t1 = max(events) if events else t0
    visits = [v for v in s["visits"] if t0 <= v[0] <= hi]
    # counts are re-taken over the sitting, never carried over from the whole file
    s["tool_calls"] = len([1 for e in s["tool_ts"] if t0 <= e <= hi])
    tool_in_window = [e for e in s["tool_ts"] if t0 <= e <= hi]
    s["bash"] = [b for b in s["bash"] if t0 <= b[0] <= hi]
    # the honest paragraph, re-counted over THIS sitting: five disjoint categories that sum to
    # every `type: "user"` record in the window (authorship.py), not to the whole file's.
    s["counts"] = {c: 0 for c in CATEGORIES}
    for ts_, cat in s["user_cats"]:
        if t0 <= ts_ <= hi:
            s["counts"][cat] += 1
    s["user_records"] = sum(s["counts"].values())
    s["first_prompt"] = s["prompt_at"].get(t0) or s["first_prompt"]
    sitting_no = idx
    # the project is the directory THIS SITTING worked in, not the one the terminal was opened
    # in hours earlier: a long-lived terminal changes cwd (median 3 distinct values per file,
    # max 31), so a whole-file mode names the wrong repository.
    win_cwds: dict[str, int] = {}
    for ts_, c in s["cwds"]:
        if t0 <= ts_ <= hi:
            win_cwds[c] = win_cwds.get(c, 0) + 1
    cwd = max(win_cwds, key=win_cwds.get) if win_cwds else ""
    repo = gitwork.repo_of(cwd) if cwd else None
    from .project_identity import identity as project_identity
    repo_name, repo_root = repo if repo else (os.path.basename(cwd.rstrip("/")) or "session", None)

    # ---- git is the witness for what shipped. Same window as the drawing, offset explicit.
    commits = gitwork.commits_in(repo_root, t0, t1) if repo_root else []
    shipped_paths = {p for c in commits for p in c["files"]}

    # ---- one row per file, ordered by first arrival
    files: dict[str, dict] = {}
    for ts, p, kind in visits:
        f = files.setdefault(p, dict(path=p, first=ts, last=ts, edits=0, reads=0, marks=[]))
        f["last"] = ts
        f["edits" if kind == "edit" else "reads"] += 1
        if f["marks"] and (ts - f["marks"][-1]["end"]).total_seconds() <= MERGE_GAP:
            m = f["marks"][-1]
            m["end"] = ts
            m["n"] += 1
            if kind == "edit":
                m["kind"] = "edit"
        else:
            f["marks"].append(dict(start=ts, end=ts, kind=kind, n=1))

    edited = [p for p, f in files.items() if f["edits"]]
    ign = gitwork.ignored(repo_root, edited) if (repo_root and edited) else set()
    in_repo_edited = [p for p in edited
                      if repo_root and p.startswith(repo_root + "/") and p not in ign]
    # for every file this grind edited and did not ship inside the window, ask git the question
    # a reader is actually asking: has anything committed it SINCE? (see gitwork.touched_since --
    # the strict-window version of this printed four dead ends that were all committed 41 minutes
    # later, which is a true sentence about the window and a false one about the world)
    pending = [p for p in in_repo_edited if p not in shipped_paths]
    later = gitwork.touched_since(repo_root, pending, t1) if pending else {}
    for p, f in files.items():
        f["shipped"] = p in shipped_paths
        f["ignored"] = p in ign
        f["in_repo"] = bool(repo_root) and p.startswith(repo_root + "/")
        f["committed_later"] = later.get(p)
        # THREE states, each one a thing git can be asked. A file git is told to ignore, and a
        # file outside the repository, are in none of them: for those the claim would be about a
        # design choice, not about the grind.
        f["deadend"] = (bool(f["edits"]) and f["in_repo"] and not f["ignored"]
                        and not f["shipped"] and not f["committed_later"])
        # THE PRIVACY RULE lives in one place and every row goes through it. It is positive
        # (see agentgrinder/privacy.py): a repo-relative path inside THIS repo, otherwise the
        # NAME of the repo the file belongs to, otherwise a shape word. Never a home path,
        # never a vault or memory basename, never a bare filename from outside a repo.
        f["rel"], f["where"] = privacy.safe_label(p, repo_root, opt_in=show_paths)

    order = sorted(files.values(), key=lambda f: f["first"])
    rank = sorted(order, key=lambda f: (-(f["edits"] * 3 + f["reads"]), f["first"]))
    keep = {id(f) for f in rank[:MAX_ROWS]}
    rows = [f for f in order if id(f) in keep]
    rest = [f for f in order if id(f) not in keep]

    # A research sitting that read 31 files outside its repo drew FOURTEEN ROWS ALL READING
    # "elsewhere on this machine" -- correct, safe, and a drawing a reader learns nothing from.
    # Found by opening research-dark.png, not by reading the labels as a list.
    #
    # Numbered over the DRAWN rows, not over every file. The first attempt counted across all 31
    # and the trace ran "...12, 13, 24 of 31", because rows are chosen by activity and printed by
    # arrival. Every one of those numbers was true and the sequence still read as a bug -- and it
    # leaked the arrival rank of files the card had deliberately not drawn. Only what is on the
    # card gets counted, so the denominator is a number a reader can verify by counting rows.
    from collections import Counter
    _dupes = Counter(f["rel"] for f in rows)
    _seen: dict[str, int] = {}
    for f in rows:
        if _dupes[f["rel"]] > 1 and f.get("where") != "in_repo":
            base = f["rel"]
            _seen[base] = _seen.get(base, 0) + 1
            f["rel"] = base + "  " + str(_seen[base]) + " of " + str(_dupes[base])

    # ---- the effort profile: tool calls per minute, bucketed to a real maximum
    span = max((t1 - t0).total_seconds(), 60)
    nb = 90
    series = [0] * nb
    for e in tool_in_window:
        series[min(nb - 1, int((e - t0).total_seconds() / span * nb))] += 1
    bucket_s = span / nb

    stretch = longest_stretch(s["typed"], events, t1, tool_in_window)
    moving = _moving(events)

    # ---- the five numbers this repo can compute (METRICS-AGENTIC-ENGINEERING-2026-09-02, an internal spec not in this repo)
    # Same window as every other count on the card. The claim rule lives in claims.py and is
    # calibrated (precision 0.63, recall 0.66 on a held-out hand-labelled set, 3 Sep 2026); the
    # card prints the claim share beside the headline so a reader sees both halves of it.
    claims, claims_verified = _claims_in_window(s["claim_ev"], t0, hi)
    artifacts_produced = len({p for _, p, kind in visits if kind == "edit" and os.path.exists(p)})

    # REACH — the same window, the same commits the trace draws, asked of git (reach.py). None
    # whenever the machine cannot tell, and the reason travels with it as the dash's sentence.
    reach_value, reach_reason = reachmod.reach_of(repo_root, t0, t1, [c["hash"] for c in commits])

    title = _title(s["first_prompt"], repo_name, show_prompt=show_paths)
    # The card only quotes the headline back as a typed sentence when it really is one.
    prompt_shown = bool(show_paths and privacy.safe_prompt(s["first_prompt"], opt_in=True))
    run = dict(
        athlete=athlete, harness="Claude Code", title=title, project=repo_name, project_identity=project_identity(cwd),
        prompt_shown=prompt_shown, paths_opted_in=bool(show_paths),
        # repo_root / cwd / source were absolute paths on the author's machine and travelled in
        # every `--json` dump. The card never needed them; only the repo NAME is printed.
        repo_root=repo_root if show_paths else None, cwd=repo_name, source=os.path.basename(path),
        sitting=dict(index=sitting_no + 1, of=len(windows), gap_min=gap // 60),
        started=t0.isoformat(), ended=t1.isoformat(),
        duration_s=moving, wall_s=int((t1 - t0).total_seconds()),
        turns_typed=len(s["typed"]), tool_calls=s["tool_calls"],
        typed_stamps=[t.isoformat() for t in s["typed"]],
        files_edited=len(edited), files_read=len([p for p, f in files.items() if not f["edits"]]),
        files_touched=len(files),
        commits=len(commits),
        # verified per turn = (claims_verified + artifacts_produced) ÷ turns_typed (metrics.headline_of).
        # corrections and artifacts_promised have no source on this machine and stay dashes.
        # reach is asked of git over THIS window, with the same commits the trace draws (reach.py).
        claims=claims, claims_verified=claims_verified, artifacts_produced=artifacts_produced,
        corrections=None, artifacts_promised=None,
        reach=reach_value, reach_reason=reach_reason,
        commits_list=[dict(hash=c["hash"], at=c["at"], subject=c["subject"],
                           # file NAMES never travel; the digest is only a join key (see _key)
                           files=[_key(p) for p in c["files"]]) for c in commits],
        deadends=[f["rel"] for f in order if f["deadend"]],
        ship_states=_ship_states(order),
        later=[dict(rel=f["rel"], at=f["committed_later"]) for f in order if f["committed_later"]],
        rows=[_row(f) for f in rows],
        more_paths=[privacy.safe_label(f["path"], repo_root, opt_in=show_paths)[0]
                    for f in rest if f["edits"]],
        more=dict(files=len(rest), edits=sum(f["edits"] for f in rest),
                  reads=sum(f["reads"] for f in rest),
                  marks=[dict(start=m["start"].isoformat(), end=m["end"].isoformat(),
                              kind=m["kind"], n=m["n"]) for f in rest for m in f["marks"]],
                  deadends=len([f for f in rest if f["deadend"]]),
                  later=len([f for f in rest if f["committed_later"]])),
        series=series, bucket_s=bucket_s, trace_basis="elapsed-agent-tool-calls",
        bash=len(s["bash"]),
        stretch=(dict(start=stretch["start"].isoformat(), end=stretch["end"].isoformat(),
                      wall_s=stretch["wall_s"], active_s=stretch["active_s"],
                      tool_calls=stretch["tools"],
                      commits=len([c for c in commits
                                   if stretch["start"].isoformat() < c["at"] <= stretch["end"].isoformat()]),
                      edits=len([v for v in visits if stretch["start"] < v[0] <= stretch["end"] and v[2] == "edit"]))
                 if stretch else None),
        authorship=dict(by_category=s["counts"], user_records_total=s["user_records"],
                        gate="promptSource in (typed, queued); drop isMeta / isSidechain / tool_result"),
        git=dict(root=repo_name if repo_root else None, commits=len(commits),
                 reason=None if repo_root else "not inside a git work tree"),
    )
    from .capture_metadata import recorded
    from .native_sittings import records as read_records
    def in_window(row):
        try:
            stamp=datetime.fromisoformat(row.get("timestamp", "").replace("Z", "+00:00"))
            return t0 <= stamp <= hi
        except (TypeError, ValueError):
            return False
    run["capture_metadata"] = recorded((r for r in read_records(path) if in_window(r)), "claude")
    return run


def _claims_in_window(claim_ev: list, t0: datetime, t1: datetime) -> tuple[int, int]:
    """(claims, verified) over one sitting, by the v0 rule. Records without a timestamp were
    never collected, so nothing outside the window can leak in and nothing is guessed."""
    tr = ClaimTracker()
    for ts, kind, text in claim_ev:
        if not (t0 <= ts <= t1):
            continue
        if kind == "typed":
            tr.typed_turn()
        elif kind == "text":
            tr.assistant_text(text)
        else:
            tr.tool_result(text)
    tr.close()
    return tr.claims, tr.verified


SHIP_STATES = ("shipped", "later", "never", "unasked")

SHIP_LABELS = {
    "shipped": "landed in a commit made during the grind",
    "later":   "committed after the grind closed",
    "never":   "nothing has committed since you edited it",
    "unasked": "outside this repository, or a path git is told to ignore",
}


def _ship_states(files: list[dict]) -> dict:
    """Every file this grind EDITED, in exactly one state. Disjoint, and they sum.

    Computed once, here, and printed from here -- never recomputed at the surface. The card's
    first version rebuilt these counts from three separate set expressions and printed
    `6 + 5 + 0 + 10 = 21` over a denominator of 20, because a git-ignored file that is
    nevertheless tracked fell into two of them. Categories that must add up cannot be allowed to
    drift apart, which is the same rule `authorship.py` enforces on the other tally.
    """
    out = {k: 0 for k in SHIP_STATES}
    for f in files:
        if not f["edits"]:
            continue
        if f["shipped"]:
            out["shipped"] += 1
        elif f["committed_later"]:
            out["later"] += 1
        elif not f["in_repo"] or f["ignored"]:
            out["unasked"] += 1
        else:
            out["never"] += 1
    return out


def _key(path: str) -> str:
    """A stable join key for a file, carrying none of its name.

    Rows and commit file-lists have to be matched (a commit flag is drawn on the row of every
    file git says it contains). That join used the ABSOLUTE PATH, which meant every `--json`
    dump of a run shipped the author's full file tree even when the card printed none of it.
    A digest joins exactly as well and says nothing.
    """
    import hashlib
    return hashlib.sha1(os.path.abspath(path).encode()).hexdigest()[:12]


def _row(f: dict) -> dict:
    return dict(rel=f["rel"], key=_key(f["path"]), edits=f["edits"], reads=f["reads"],
                first=f["first"].isoformat(), last=f["last"].isoformat(),
                shipped=f["shipped"], deadend=f["deadend"], ignored=f["ignored"],
                later=f["committed_later"],
                in_repo=f["in_repo"], where=f.get("where", "elsewhere"),
                marks=[dict(start=m["start"].isoformat(), end=m["end"].isoformat(),
                            kind=m["kind"], n=m["n"]) for m in f["marks"]])


# `_shorten` was deleted on 31 Aug 2026 and is not coming back. It was the whole leak.
#
# It existed for READABILITY: a path outside the repo was too wide for a row label, so it kept
# the last two segments and dropped the rest. That is the exact inverse of what privacy wants.
# The prefix it dropped (a home directory, a synced-notes directory) is the part nobody needs;
# the tail it kept is the part that identifies a person — the name of a note, of a memory file,
# of a company in a job-hunt repository. Shipped cards printed row labels naming three companies
# this author was applying to, and the renderer was working exactly as designed.
#
# A shorter path is not a safer path. The replacement, `privacy.safe_label`, does not shorten
# anything: it decides, per file, which of three THINGS a reader is allowed to be told.


def _title(prompt: str | None, project: str, show_prompt: bool = False) -> str:
    """The headline fallback. A typed prompt is a keystroke log, so it is opt-in only.

    The old version always used the first prompt, truncated to 64 characters. That is how
    "ok paste it in the download too, we have a full batch of review …" and
    "did you finish the AI for strava?" reached shipped screenshots, and how one card printed
    a path a prompt happened to contain. The default is now the project name.
    """
    line = privacy.safe_prompt(prompt, opt_in=show_prompt)
    return line or f"{project} session"
