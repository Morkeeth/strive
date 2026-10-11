"""FLEET INGEST — aggregate one multi-agent night run into a single Run.

A solo session is a line. A fleet run is a MAP: a human trunk of typed prompts, with agent lanes
branching off it at real spawn times, each landing in a real repo and either shipping a commit or
dying as a spur. That shape is the signature device; this module produces the data it is drawn from.

Authorship (Constitution rule 2) is NOT decided here. Every `type: "user"` record goes through
`authorship.classify`, which is Transcripto's measured gate vendored into this package, and comes
back as exactly one of five disjoint categories. This module only counts them, window-bounded.
Subagent transcripts carry the PARENT's prompt as `type: "user"` with no promptSource, so they
contribute zero human turns by construction -- measured, not assumed, and printed on the card.

Nothing here invents a number. Commits are counted twice on purpose: what the transcript CLAIMS
(a `git commit` command was issued) and what git VERIFIES (`git log --since`), and the card prints
the verified one.
"""
from __future__ import annotations

import glob
import json
import os
import re
import subprocess
from collections import Counter
from datetime import datetime, timedelta, timezone

from .gitwork import parse_iso
from .authorship import CATEGORIES, classify

HOME = os.path.expanduser("~")
PROJECTS = os.path.join(HOME, ".claude", "projects")
_EDIT_TOOLS = {"Edit", "Write", "NotebookEdit"}
_REPO_RE = re.compile(r"/Users/[A-Za-z0-9_.-]+/CODE/([A-Za-z0-9_.-]+)")
_REPO_DIR_CACHE: dict[str, tuple[str, str] | None] = {}


_CANON_CACHE: dict[str, tuple[str, str]] = {}


def _canonical_repo(root: str) -> tuple[str, str]:
    """(repository_name, repository_path) for a work tree — resolving a linked worktree to its parent.

    A linked worktree has its own `.git` FILE and its own directory name, but it shares refs with
    the repository it came from, so `git log --all` in both returns THE SAME COMMITS. Treating the
    two as separate destinations counted 32 of tonight's 99 commits twice, and printed the pairs
    side by side on the card: repo B 21 / lane c 21, repo G 7 / lane e 7,
    repo A 4 / lane d 4. One repository, counted once.
    """
    if root in _CANON_CACHE:
        return _CANON_CACHE[root]
    name, path = os.path.basename(root), root
    try:
        out = subprocess.run(["git", "-C", root, "rev-parse", "--path-format=absolute",
                              "--git-common-dir"], capture_output=True, text=True, timeout=10)
        common = (out.stdout or "").strip()
        if out.returncode == 0 and common.endswith("/.git"):
            path = os.path.dirname(common)
            name = os.path.basename(path)
    except (OSError, subprocess.SubprocessError):
        pass
    _CANON_CACHE[root] = (name, path)
    return name, path


def _repo_of(path: str) -> tuple[str, str] | None:
    """(repository_name, repository_path) for the git repository enclosing `path`, else None.

    Walks up the real directory tree instead of pattern-matching ~/CODE, so a lane that works in
    a vault, a worktree, or anywhere else is still placed on a real destination. A linked worktree
    resolves to the repository it belongs to (see _canonical_repo).
    """
    d = path if os.path.isdir(path) else os.path.dirname(path)
    seen = []
    while d and d != "/" and d != HOME:
        if d in _REPO_DIR_CACHE:
            hit = _REPO_DIR_CACHE[d]
            for s_ in seen:
                _REPO_DIR_CACHE[s_] = hit
            return hit
        seen.append(d)
        if os.path.exists(os.path.join(d, ".git")):
            hit = _canonical_repo(d)
            for s_ in seen:
                _REPO_DIR_CACHE[s_] = hit
            return hit
        d = os.path.dirname(d)
    for s_ in seen:
        _REPO_DIR_CACHE[s_] = None
    return None
_LANE_RE = re.compile(r"LANE\s+(L\d+)\s*[—–-]\s*([A-Z0-9][A-Z0-9 \-+.'/]{1,38})")
_COMMIT_RE = re.compile(r"git\s+(?:-C\s+\S+\s+)?commit")


def _ts(o: dict):
    """Transcript stamps are UTC. Everything downstream is LOCAL.

    Mixing the two put "19:38 -> 01:52" on a rendered card where the start was UTC and the end was
    the machine's local clock — a silent two-hour lie, with the hour grid labelled in UTC beneath
    lane times labelled in UTC and a header labelled in both. One timezone, converted at the door.
    """
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


def _scan(path: str):
    """One pass over a transcript. Returns everything the map needs, content never retained."""
    typed, events, edits, bash_calls = [], [], [], 0
    tool_stamps: list[tuple] = []   # (timestamp, tool_name) — lets every count be window-bounded
    file_stamps: list[tuple] = []   # (timestamp, file_path)
    tools = 0
    tool_names = Counter()
    repo_track = []          # (timestamp, repo) in order — the footprints
    commit_claims = []       # timestamps where a `git commit` command was issued
    files = set()
    repo_paths: dict[str, str] = {}
    cwd = None
    # every `type: "user"` record, stamped and CLASSIFIED once, so that no downstream count has to
    # re-guess who wrote it and the categories on the card are disjoint by construction.
    user_stamps: dict[str, list] = {c: [] for c in CATEGORIES}
    # A SECOND, independent count, taken WITHOUT the isSidechain rule. The card claims no lane
    # brief was typed by a person; `human` cannot support that claim, because `classify` drops
    # sidechain records before it ever asks about promptSource, so the answer would be 0 by
    # construction -- a number that is right about the wrong object. This one asks the raw
    # question of every record in the file: did anything here carry a keystroke's stamp?
    keystroke_stamps: list = []
    first_user_text = None
    models = set()
    sidechain = False
    agent_id = None

    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            t = _ts(o)
            if t:
                events.append(t)
            if cwd is None and o.get("cwd"):
                cwd = o["cwd"]
            if o.get("isSidechain"):
                sidechain = True
            if agent_id is None and o.get("agentId"):
                agent_id = o["agentId"]
            typ = o.get("type")
            msg = o.get("message") if isinstance(o.get("message"), dict) else {}

            if typ == "user":
                cat = classify(o)
                if t:
                    user_stamps[cat].append(t)
                if cat == "human" and t:
                    typed.append(t)
                if t and o.get("promptSource") in ("typed", "queued"):
                    keystroke_stamps.append(t)
                if first_user_text is None and cat in ("orchestrator", "human"):
                    # the lane's brief is the first thing the orchestrator SAID to it, never the
                    # first tool result that happened to come back first
                    first_user_text = _text(msg)[:4000]
            elif typ == "assistant":
                if msg.get("model"):
                    models.add(msg["model"])
                content = msg.get("content")
                if not isinstance(content, list):
                    continue
                for b in content:
                    if not (isinstance(b, dict) and b.get("type") == "tool_use"):
                        continue
                    tools += 1
                    name = b.get("name", "")
                    tool_names[name] += 1
                    if t:
                        tool_stamps.append((t, name))
                    inp = b.get("input") or {}
                    fp = inp.get("file_path") or inp.get("notebook_path")
                    if name in _EDIT_TOOLS and fp:
                        files.add(fp)
                        if t:
                            file_stamps.append((t, fp))
                        if t:
                            edits.append(t)
                        r = _repo_of(fp)
                        if r and t:
                            repo_track.append((t, r[0]))
                            repo_paths[r[0]] = r[1]
                    if name == "Bash":
                        bash_calls += 1
                        cmd = inp.get("command") or ""
                        m = _REPO_RE.search(cmd)
                        if m and t:
                            rp = os.path.join(HOME, "CODE", m.group(1))
                            if os.path.exists(os.path.join(rp, ".git")):
                                nm, rp = _canonical_repo(rp)
                            else:
                                nm = m.group(1)
                            repo_track.append((t, nm))
                            repo_paths.setdefault(nm, rp)
                        if _COMMIT_RE.search(cmd) and t:
                            commit_claims.append(t)

    return dict(path=path, typed=typed, events=events, edits=edits, tools=tools,
                tool_stamps=tool_stamps, file_stamps=file_stamps, user_stamps=user_stamps,
                keystroke_stamps=keystroke_stamps,
                tool_names=tool_names, repo_track=repo_track, commit_claims=commit_claims,
                files=files, repo_paths=repo_paths, cwd=cwd,
                first_user_text=first_user_text,
                models=models, sidechain=sidechain, agent_id=agent_id, bash_calls=bash_calls)


def _lane_code(text: str | None) -> tuple[str | None, str | None]:
    """(code, name) when the brief carries a `LANE Lx — NAME` header, else (None, None).

    Continuation lanes (a wave re-entering a lane it already opened) carry the previous lane's
    closeout instead of a header, so they legitimately have no code. We do not guess one — the
    repo they land in is the honest label, assigned by the caller.
    """
    if not text:
        return None, None
    m = _LANE_RE.search(text)
    if m:
        name = m.group(2).strip()
        # the brief continues "... — NAME. Repo ~/CODE/x", so drop a trailing sentence fragment
        name = re.sub(r"[.\s]+R(?:epo)?$", "", name).strip(" .,-")
        return m.group(1), name.title() if name.isupper() else name
    return None, None


def _in_window(stamps, lo, hi):
    return any(lo <= t <= hi for t in stamps)


def collect(since: datetime, until: datetime, athlete: str = "you",
            burst_gap: int = 30, burst: bool = True) -> dict:
    """Build the night-run Run from every transcript with activity inside the window.

    `burst=True` (the default, and what the night-run card wants) narrows the window to the LAST
    contiguous burst of activity, because a night run is one run and not everything since the
    earliest stray lane. See the burst comment below.

    `burst=False` measures the WHOLE requested window. Anything that reports a property of the
    machine rather than of one run must pass False, or it will describe the last hour and print
    the caller's window next to it.

    THIS DEFAULT WAS A SILENT NARROWING. `authorship` reported over the last burst while its
    header printed a span and its docs said "every type:user record in the window". Measured
    4 Sep 2026 over a 336 hour window on a machine with 1,534 transcripts: 296 files passed the
    mtime filter, 57 held a typed turn inside the window, 966 typed turns in total, and the
    command reported 1 session, 62 records and 5 human. The burst threw away 56 sessions and 961
    typed turns, correctly for a night run and catastrophically for a machine-wide count.
    """
    mains = sorted(glob.glob(os.path.join(PROJECTS, "*", "*.jsonl")))
    subs = sorted(glob.glob(os.path.join(PROJECTS, "*", "*", "subagents", "**", "agent-*.jsonl"), recursive=True))

    def recent(p):
        try:
            return os.path.getmtime(p) >= since.timestamp() - 3600
        except OSError:
            return False

    sessions, lanes = [], []
    repo_paths: dict[str, str] = {}
    typed_all, all_events = [], []
    tool_total = 0
    tool_names = Counter()
    files_all = set()
    # per-category `type:user` tallies, kept separately for the human trunk and the agent lanes
    cats_main = {c: 0 for c in CATEGORIES}
    cats_sub = {c: 0 for c in CATEGORIES}
    keystrokes_sub = 0
    models = set()

    main_scans = []
    for p in [x for x in mains if recent(x)]:
        s = _scan(p)
        if not [t for t in s["typed"] if since <= t <= until]:
            continue
        main_scans.append((p, s))
        typed_all += [t for t in s["typed"] if since <= t <= until]

    sub_scans = []
    for p in [x for x in subs if recent(x)]:
        s = _scan(p)
        if not [t for t in s["events"] if since <= t <= until]:
            continue
        sub_scans.append((p, s))
    # ---- resolve the window BEFORE any number is counted ----
    # A night run is a CONTIGUOUS BURST of lanes, not everything since the earliest stray subagent.
    # A one-minute research lane hours earlier is real, but it is not part of this run: counting it
    # stretched `elapsed` by 3h32m and left two thirds of the map empty. So: split the lanes wherever
    # no lane at all was open for longer than `burst_gap`, keep the LAST burst, and say what was
    # dropped rather than quietly widening the frame.
    lane_spans = sorted((min(w), max(w)) for w in
                        ([t for t in sc["events"] if since <= t <= until] for _, sc in sub_scans) if w)
    # the burst is measured over BOTH kinds of activity. Lanes alone would start the run at the
    # moment the fleet opened and cut off the human evening that set it up (on this machine that
    # scored the night "1 typed prompt"); human turns alone would ignore the fleet entirely.
    all_spans = sorted(lane_spans + [(t, t) for t in typed_all])
    excluded_lanes, burst_start = 0, None
    if not burst:
        # the caller asked about the window, so the window is what it gets
        t0 = min([a for a, _ in all_spans], default=None) or (min(typed_all) if typed_all else since)
        t0 = max(t0, since)
    elif all_spans:
        gap = timedelta(minutes=burst_gap)
        burst_start, open_until = all_spans[0]
        for a, b in all_spans[1:]:
            if a - open_until > gap:
                burst_start, open_until = a, b   # idle longer than the gap: a different run
            else:
                open_until = max(open_until, b)
        excluded_lanes = sum(1 for a, _ in lane_spans if a < burst_start)
        t0 = burst_start
    else:
        t0 = min(typed_all) if typed_all else since
    # A run that is still going is measured to NOW; a run that has stopped is measured to its last
    # record. Labelling both "first->last record" was a claim the second number did not support.
    newest = max([t for sc in [x for _, x in main_scans + sub_scans] for t in sc["events"]
                  if t <= until] or [t0])
    run_open = (until - newest) <= timedelta(minutes=10)
    t1 = until if run_open else newest

    def win(stamps):
        return [t for t in stamps if t0 <= t <= t1]

    for p, s in main_scans:
        typed_in = win(s["typed"])
        if not typed_in:
            continue
        ev = win(s["events"])
        sess_tools = len([1 for t, _ in s["tool_stamps"] if t0 <= t <= t1])
        s_start, s_end = min(typed_in), (max(ev) if ev else max(typed_in))
        # which repo this session was actually working in, by where its edits landed
        sess_repos = Counter()
        for t, f in s["file_stamps"]:
            if t0 <= t <= t1:
                r = _repo_of(f)
                if r:
                    sess_repos[r[0]] += 1
        mins = max((s_end - s_start).total_seconds() / 60, 0.1)
        sessions.append(dict(
            id=os.path.basename(p)[:8], typed=len(typed_in),
            started=s_start, ended=s_end, duration_s=int((s_end - s_start).total_seconds()),
            tools=sess_tools, pace=round(sess_tools / mins, 1),
            repo=(sess_repos.most_common(1)[0][0] if sess_repos else None),
            user_records=sum(len(win(v)) for v in s["user_stamps"].values()),
        ))
        all_events += ev
        tool_total += len([1 for t, _ in s["tool_stamps"] if t0 <= t <= t1])
        tool_names += Counter(n for t, n in s["tool_stamps"] if t0 <= t <= t1)
        files_all |= {f for t, f in s["file_stamps"] if t0 <= t <= t1}
        repo_paths.update(s["repo_paths"])
        for c in CATEGORIES:
            cats_main[c] += len(win(s["user_stamps"][c]))
        models |= s["models"]
    typed_all = sorted(win(typed_all))

    for p, s in sub_scans:
        ev = win(s["events"])
        if not ev:
            continue
        code, lane_name = _lane_code(s["first_user_text"])
        track = [(t, r) for t, r in s["repo_track"] if t0 <= t <= t1]
        repo_counts = Counter(r for _, r in track)
        commits_claimed = [t for t in s["commit_claims"] if t0 <= t <= t1]
        wave = os.path.basename(os.path.dirname(p))
        lanes.append(dict(
            agent_id=s["agent_id"] or os.path.basename(p)[6:14],
            code=code, lane_name=lane_name, wave=wave if wave.startswith("wf_") else "solo",
            started=min(ev), ended=max(ev), duration_s=int((max(ev) - min(ev)).total_seconds()),
            tools=len([1 for t, _ in s["tool_stamps"] if t0 <= t <= t1]),
            bash=s["bash_calls"], edits=len(win(s["edits"])),
            files=len(s["files"]),
            repos=[r for r, _ in repo_counts.most_common()],
            repo=(repo_counts.most_common(1)[0][0] if repo_counts else None),
            track=[(t.isoformat(), r) for t, r in track],
            commit_claims=[t.isoformat() for t in commits_claimed],
            tool_names=dict(s["tool_names"].most_common(6)),
        ))
        all_events += ev
        tool_total += len([1 for t, _ in s["tool_stamps"] if t0 <= t <= t1])
        tool_names += Counter(n for t, n in s["tool_stamps"] if t0 <= t <= t1)
        files_all |= {f for t, f in s["file_stamps"] if t0 <= t <= t1}
        repo_paths.update(s["repo_paths"])
        for c in CATEGORIES:
            cats_sub[c] += len(win(s["user_stamps"][c]))
        keystrokes_sub += len(win(s["keystroke_stamps"]))
        models |= s["models"]

    lanes.sort(key=lambda l: l["started"])
    typed_all.sort()

    repos = sorted({r for l in lanes for r in l["repos"]})
    verified = {r: _git_commits(repo_paths.get(r, os.path.join(HOME, "CODE", r)), t0, t1)
                for r in repos}

    # rhythm: typed turns per bucket over the wall-clock span (kept for the small secondary trace)
    buckets = 24
    span = max((t1 - t0).total_seconds(), 1)
    rhythm = [0] * buckets
    for t in typed_all:
        rhythm[min(buckets - 1, int((t - t0).total_seconds() / span * buckets))] += 1

    # lane density: tool calls are not timestamped per-lane cheaply, so pace = tools/minute (real ratio)
    for l in lanes:
        mins = max(l["duration_s"] / 60, 0.1)
        l["pace"] = round(l["tools"] / mins, 1)
        l["label"] = l["lane_name"] or l["repo"] or "recon"
        l["started_iso"] = l["started"].isoformat()
        l["ended_iso"] = l["ended"].isoformat()
        # NOT a per-lane commit count. A repo's commits are drawn as timestamped ticks on the
        # repo's own trail; a number lifted from the repo and printed beside a lane would claim
        # authorship the transcript cannot prove. What IS provable: commits landed while this
        # lane was open in this repo.
        l["overlapping_commits"] = (
            len([c for c in verified[l["repo"]]["stamps"] if l["started_iso"] <= c <= l["ended_iso"]])
            if l["repo"] and verified.get(l["repo"], {}).get("stamps") is not None else None)

    # THE HANDOFF: the last turn a human typed. Everything after it is the fleet running alone —
    # the single most load-bearing fact about a night run, so it is computed, not narrated.
    handoff = max(typed_all) if typed_all else None
    after = None
    if handoff is not None:
        after_tools = 0
        for _, sc in main_scans + sub_scans:
            after_tools += len([1 for t, _ in sc["tool_stamps"] if handoff < t <= t1])
        after = dict(
            at=handoff.isoformat(),
            lanes_opened=len([l for l in lanes if l["started"] > handoff]),
            lanes_running=len([l for l in lanes if l["started"] <= handoff < l["ended"]]),
            tool_calls=after_tools,
            commits=len([c for v in verified.values() for c in (v["stamps"] or [])
                         if c > handoff.isoformat()]),
            hours=round((t1 - handoff).total_seconds() / 3600, 2),
        )

    return dict(
        athlete=athlete,
        kind="fleet",
        handoff=after,
        started=t0.isoformat(), ended=t1.isoformat(),
        duration_s=int((t1 - t0).total_seconds()),
        turns_typed=len(typed_all),
        typed_stamps=[t.isoformat() for t in typed_all],
        tool_calls=tool_total,
        files_touched=len(files_all),
        rhythm=rhythm,
        sessions=[{**{k: v for k, v in s.items() if k not in ("started", "ended")},
                   "started_iso": s["started"].isoformat(), "ended_iso": s["ended"].isoformat(),
                   "label": s["repo"] or "your session", "code": None}
                  for s in sorted(sessions, key=lambda z: z["started"])],
        lanes=[{k: v for k, v in l.items() if k not in ("started", "ended")} for l in lanes],
        repos=[dict(name=r, **verified[r]) for r in repos],
        commits_verified=len({h for v in verified.values() for h in (v["hashes"] or [])}),
        repos_untracked=[r for r in repos if verified[r]["count"] is None],
        commits_claimed=sum(len(l["commit_claims"]) for l in lanes),
        tool_mix=dict(tool_names.most_common(8)),
        models=sorted(models),
        run_open=run_open,
        window=dict(since=since.isoformat(), burst_gap_min=burst_gap,
                    lanes_excluded_before_burst=excluded_lanes,
                    scanned_from=since.isoformat()),
        authorship=dict(
            # DISJOINT and summing to `user_records_total` -- the card asserts it before printing.
            by_category={c: cats_main[c] + cats_sub[c] for c in CATEGORIES},
            main={c: cats_main[c] for c in CATEGORIES},
            subagent={c: cats_sub[c] for c in CATEGORIES},
            user_records_total=sum(cats_main.values()) + sum(cats_sub.values()),
            user_records_main=sum(cats_main.values()),
            user_records_subagent=sum(cats_sub.values()),
            typed_turns=cats_main["human"] + cats_sub["human"],
            # measured WITHOUT the sidechain rule (see `keystroke_stamps` in _scan): how many
            # records in the lane transcripts carried promptSource typed/queued at all.
            keystrokes_in_lane_transcripts=keystrokes_sub,
            gate="promptSource in (typed, queued); drop isMeta / isSidechain / tool_result",
            command="python3 -m agentgrinder authorship --since %s" % since.isoformat(timespec="seconds"),
        ),
        harness="Claude Code",
    )


_GIT_CACHE: dict = {}


def _git_commits(path: str, since: datetime, until: datetime) -> dict:
    """Ground truth for commits: ask git, not the transcript. Bounded to an explicit window.

    Returns the count AND every commit time, so the map can draw a ship where it actually landed
    instead of printing a total next to whoever happened to be nearby.
    """
    key = (path, since.isoformat(), until.isoformat())
    if key in _GIT_CACHE:
        return _GIT_CACHE[key]
    if not os.path.exists(os.path.join(path, ".git")):
        return dict(count=None, stamps=None, hashes=None, branch=None, reason="not a git repo")
    # the trailing Z is load-bearing: without an explicit offset git reads the stamp in the
    # machine's LOCAL zone, which silently shifted this window two hours early and pulled in
    # commits made before the run started.
    iso = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    iso_hi = until.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        out = subprocess.run(
            ["git", "-C", path, "log", "--all", "--since", iso, "--until", iso_hi, "--pretty=%H %cI"],
            capture_output=True, text=True, timeout=25)
        br = subprocess.run(["git", "-C", path, "branch", "--show-current"],
                            capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError) as e:
        return dict(count=None, stamps=None, hashes=None, branch=None, reason=str(e)[:80])
    if out.returncode != 0:
        return dict(count=None, stamps=None, hashes=None, branch=None, reason=(out.stderr or "").strip()[:80])
    seen, pairs = set(), []
    for row in out.stdout.split("\n"):
        row = row.strip()
        if not row or " " not in row:
            continue
        h, when = row.split(" ", 1)
        if h in seen:
            continue
        seen.add(h)
        pairs.append(parse_iso(when).astimezone().isoformat())
    stamps = sorted(pairs)
    res = dict(count=len(stamps), stamps=stamps, hashes=sorted(seen),
               branch=(br.stdout or "").strip() or None, reason=None)
    _GIT_CACHE[key] = res
    return res


def parse_window(since: str | None, hours: float) -> tuple[datetime, datetime]:
    now = datetime.now().astimezone()
    if since:
        s = parse_iso(since)
        if s.tzinfo is None:
            s = s.replace(tzinfo=now.tzinfo)
    else:
        s = now - timedelta(hours=hours)
    return s, now + timedelta(minutes=1)


# ---- publishing: the card names real projects; a shared card must not --------------------------
def redact(run: dict) -> dict:
    """Return a copy safe to show a stranger: the SHAPE and every count survive, the NAMES do not.

    The honest blocker to posting a night run is not the design, it is that the card names private
    repositories and lane briefs ("lane A", "repo B"). Redaction renames
    destinations to stable, ordered pseudonyms and drops lane briefs to their code, so the route,
    the pace, the handoff and every number are unchanged and nothing identifies the work.

    Numbers are never touched. A redacted card that also rounded its counts would be a different
    claim, not a quieter one.
    """
    import copy
    out = copy.deepcopy(run)
    names = [r["name"] for r in run.get("repos", [])]
    for l in run.get("lanes", []):
        if l.get("repo") and l["repo"] not in names:
            names.append(l["repo"])
    # repos_untracked was never fed into the alias map, so alias.get(x, x) returned the
    # real name and repo C shipped unredacted on the card. Any name that does not enter
    # the map passes through silently -- the same failure shape as the recon whitelist.
    names += [x for x in run.get("repos_untracked", []) if x not in names]
    alias = {n: f"repo {i + 1}" for i, n in enumerate(sorted(set(names)))}
    # A destination that is not a repository still NAMES something. "recon" is a skill
    # in Oscar's private stack, and it was hardcoded here to pass through unredacted
    # on the reasoning that a lane landing nowhere identifies nothing. It identifies the
    # skill. A whitelist inside a redaction function is the one construct that cannot be
    # audited by looking at the output, because the output looks redacted.
    # Non-repo destinations now get a neutral label rather than an exemption.
    for l in run.get("lanes", []):
        d = l.get("repo")
        if d and d not in alias:
            alias[d] = "no repo"

    for r in out.get("repos", []):
        r["name"] = alias.get(r["name"], r["name"])
        r.pop("branch", None)          # branch names carry project and ticket names too
    for l in out.get("lanes", []):
        l["repo"] = alias.get(l["repo"], l["repo"])
        l["repos"] = [alias.get(x, x) for x in l.get("repos", [])]
        l["lane_name"] = None
        l["label"] = l["code"] or alias.get(l["repo"], l["repo"]) or "lane"
        l.pop("track", None)
    for sess in out.get("sessions", []):
        sess["repo"] = alias.get(sess.get("repo"), sess.get("repo"))
        sess["label"] = "your session"
    out["repos_untracked"] = [alias.get(x, x) for x in out.get("repos_untracked", [])]
    out["redacted"] = True
    return out
