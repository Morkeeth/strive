"""Native ingest: a real Claude Code session (.jsonl) -> a run dict. No external deps.

The authorship signal is not decided here: every `type: "user"` record goes through
`authorship.is_human_turn`, the one gate the whole package shares (Transcripto's measured rule,
vendored). Tool results and injected context are `type: "user"` too and are not the operator's
turns. Every number below is read from the log.
"""
from __future__ import annotations

import glob
import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

from . import gitwork, privacy, reach as reachmod
from .authorship import is_human_turn
from .project_identity import identity as project_identity
from .claims import ClaimTracker, is_tool_result, result_text

_EDIT_TOOLS = {"Edit", "Write", "NotebookEdit"}


def _ts(o: dict):
    t = o.get("timestamp")
    if not t:
        return None
    try:
        return datetime.fromisoformat(t.replace("Z", "+00:00"))
    except ValueError:
        return None


def _tool_uses(msg: dict):
    """Yield (tool_name, input_dict) for each tool_use block in an assistant message."""
    content = msg.get("content")
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                yield b.get("name", ""), (b.get("input") or {})


CLAUDE_GLOB = "~/.claude/projects/*/*.jsonl"
CURSOR_GLOB = "~/.cursor/projects/*/agent-transcripts/*/*.jsonl"
# Grok Bot exports are explicitly placed here by the user. This is an Agent Grinder import
# location, not a claim that a bot can read transcripts from somebody else's laptop.
GROKBOT_GLOB = "~/.agentgrinder/imports/grokbot/*.jsonl"

# THE READER'S HARNESSES — one registry, `--harness` key -> the name a person reads.
# Every user-facing sentence that lists what this tool can read is checked against this dict by
# tests/test_harness_strings.py. Codex was added to the reader and two shipped strings still said
# "Claude vs Cursor" for a day, so the list a stranger reads and the list the reader supports are
# now bound by a test rather than by remembering.
HARNESSES = {
    "claude": "Claude Code",
    "cursor": "Cursor",
    "codex": "Codex",
    "grokbot": "Grok Bot",
}


def latest_session() -> str | None:
    files = glob.glob(os.path.expanduser(CLAUDE_GLOB))
    return max(files, key=os.path.getmtime) if files else None


def searched_paths() -> tuple:
    """Every transcript location the tool reads, in the order it reads them.

    An error that says "nothing found" without saying where it looked is untestable by the person
    reading it. Every not-found message prints this list.
    """
    return (CLAUDE_GLOB, CURSOR_GLOB, GROKBOT_GLOB) + CODEX_GLOBS


# THE ROUTE: the folders the run went through, as station indices. site/dropin-parse.js
# folderRoute is the same rule and scripts/test-dropin-parity.mjs compares the two readers.
#   station = the folder a touched file sits in (the path up to its last slash), numbered in the
#             order the run first reached it, at most 16 stations;
#   a move  = one file touch, with consecutive touches in one folder collapsed to one stay, at
#             most 400 moves.
# The folder name is a key here and nowhere else. `route` (the indices) may be pushed;
# `route_legend` (the folder names) is LOCAL only and hook.py drops it before any save.
ROUTE_STATIONS = 16
ROUTE_MOVES = 400


def folder_route(paths) -> tuple[list[int], list[str]]:
    stations: dict[str, int] = {}
    out: list[int] = []
    for p in paths:
        key = str(p)[: max(0, str(p).rfind("/"))]
        i = stations.get(key)
        if i is None:
            if len(stations) >= ROUTE_STATIONS:
                continue
            i = len(stations)
            stations[key] = i
        if out and out[-1] == i:
            continue
        if len(out) >= ROUTE_MOVES:
            break
        out.append(i)
    return out, [os.path.basename(k) or "root" for k in stations]


def parse_session(path: str, athlete: str = "you") -> dict:
    typed_ts, all_ts = [], []
    tool_calls = 0
    files: set[str] = set()
    touched: list[str] = []  # every file a tool named, in order: the route
    tools_at: list = []      # one timestamp per tool call, for the line the card draws
    commits = 0
    project = None
    first_prompt = None
    tracker = ClaimTracker()       # v0 verified-claims rule, see claims.py
    written: set[str] = set()      # Edit/Write paths; 'produced' = the ones that exist at close

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
            if not project:
                project = o.get("cwd") or None
            typ = o.get("type")
            msg = o.get("message") if isinstance(o.get("message"), dict) else {}

            if is_human_turn(o):
                tracker.typed_turn()
                if ts:
                    typed_ts.append(ts)
                if first_prompt is None:
                    c = msg.get("content")
                    if isinstance(c, str):
                        first_prompt = c.strip()
                    elif isinstance(c, list):
                        for b in c:
                            if isinstance(b, dict) and b.get("type") == "text":
                                first_prompt = (b.get("text") or "").strip()
                                break
            elif is_tool_result(o):
                tracker.tool_result(result_text(o))
            elif typ == "assistant":
                c = msg.get("content")
                if isinstance(c, list):
                    tracker.assistant_text("\n".join(
                        b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"))
                elif isinstance(c, str):
                    tracker.assistant_text(c)
                for name, inp in _tool_uses(msg):
                    tool_calls += 1
                    if ts:
                        tools_at.append(ts)
                    at = inp.get("file_path") if isinstance(inp.get("file_path"), str) and inp.get("file_path") else (
                        inp.get("notebook_path") if isinstance(inp.get("notebook_path"), str) and inp.get("notebook_path") else None)
                    if at:
                        touched.append(at)
                    if name in _EDIT_TOOLS and inp.get("file_path"):
                        fp = inp["file_path"]; files.add(fp); written.add(fp)
                    elif name == "Bash":
                        cmd = (inp.get("command") or "")
                        if "git commit" in cmd:
                            commits += 1

    tracker.close()
    if not typed_ts:
        raise ValueError(f"no typed human turns found in {path}")
    # v0 'artifacts produced': Edit/Write paths that exist on disk at PARSE time (not at the
    # session's close — a later delete or rename reads as not produced). 'promised' has no source
    # on this machine: no harness records what a run said it would deliver, so it stays a dash.
    artifacts_produced = sum(1 for fp in written if os.path.exists(fp))

    # moving time (Strava-style): sum gaps between events, but a gap over IDLE_CAP means you stepped away
    IDLE_CAP = 1200  # 20 min
    ev = sorted(t for t in all_ts if t >= min(typed_ts))
    span = 0
    for a, b in zip(ev, ev[1:]):
        span += min((b - a).total_seconds(), IDLE_CAP)
    # rhythm: typed turns bucketed across the session span (the 'route')
    buckets = 24
    rhythm = [0] * buckets
    if span > 0:
        t0 = min(typed_ts)
        for t in typed_ts:
            idx = min(buckets - 1, int((t - t0).total_seconds() / span * buckets))
            rhythm[idx] += 1
    else:
        rhythm = [len(typed_ts)]
    # THE LINE THE CARD DRAWS: tool calls per bin of the same moving time, a gap over twenty
    # minutes counted as twenty. site/dropin-parse.js claudeReader builds the same series and
    # scripts/test-dropin-parity.mjs compares them; a one-prompt night is no longer one spike.
    line = None
    if span > 0 and tools_at:
        pos, at = {}, 0.0
        for i, t in enumerate(ev):
            if i:
                at += min((t - ev[i - 1]).total_seconds(), IDLE_CAP)
            pos.setdefault(t, at)
        line = [0] * 24
        for t in tools_at:
            if t in pos:
                line[min(23, int(pos[t] / span * 24))] += 1

    cwd = project.rstrip("/") if project else ""
    proj_name = os.path.basename(cwd) if cwd else "session"
    # REACH — did this cross to a person who is not the author? git is the witness, and the
    # answer is None whenever the machine cannot tell (agentgrinder/reach.py).
    repo = gitwork.repo_of(cwd) if cwd else None
    reach_value, reach_reason = reachmod.reach_of(
        repo[1] if repo else None, min(typed_ts), max(all_ts or typed_ts))
    # real characteristic: does the project carry a rules/context file? (Karpathy: rules cut errors ~41%->11%)
    rules = None; rules_lines = 0; has_plan = False
    if cwd:
        for pc in ("spec.md", "PLAN.md", "plan.md", "docs/spec.md", "docs/PLAN.md"):
            if os.path.exists(os.path.join(cwd, pc)):
                has_plan = True
                break
        for cand in ("CLAUDE.md", "AGENTS.md", ".cursor/rules", ".cursorrules"):
            p = os.path.join(cwd, cand)
            if os.path.exists(p):
                rules = cand
                try: rules_lines = sum(1 for _ in open(p, encoding="utf-8", errors="ignore"))
                except OSError: rules_lines = 0
                break
    title = (first_prompt[:60] + "…") if first_prompt and len(first_prompt) > 60 else (first_prompt or f"{proj_name} session")
    route_ix, route_names = folder_route(touched)

    return {
        "athlete": athlete,
        "title": title,
        "harness": "Claude Code",
        "project": proj_name,
        "started": min(typed_ts).isoformat(),
        "duration_s": int(span),
        "turns_typed": len(typed_ts),
        "tool_calls": tool_calls,
        "files_touched": len(files),
        "commits": commits,
        "rhythm": rhythm,
        "line": line,                            # tool calls per bin of moving time, or None
        # the five numbers (METRICS-AGENTIC-ENGINEERING-2026-09-02, an internal spec not in this repo); None = not this repo's to compute
        "claims": tracker.claims,
        "claims_verified": tracker.verified,     # v0 rule, claims.py
        "corrections": None,                     # Transcripto (coach inverse class) — not built
        "artifacts_produced": artifacts_produced,
        "artifacts_promised": None,              # not measured yet: nothing records what was promised
        "reach": reach_value,                    # git remotes + push refs + gh (reach.py)
        "reach_reason": reach_reason,            # the sentence the dash prints on hover
        "has_rules": bool(rules), "rules_file": rules, "rules_lines": rules_lines, "has_plan": has_plan,
        "rig": detect_rig(),
        "route": route_ix,                       # numbers only -- safe to publish
        "route_legend": route_names,             # folder names — LOCAL only, never pushed
    }


# ---- Cursor origin -----------------------------------------------------------
# Cursor stores one session per dir: ~/.cursor/projects/*/agent-transcripts/<uuid>/<uuid>.jsonl
# A TYPED human turn is role:user whose text carries a <user_query>...</user_query> wrapper
# (Cursor's own honest authorship signal; injected/tool records do not carry it).
import re as _re

def _cursor_text(msg: dict) -> str:
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
    return ""

def _cursor_tool_blocks(msg: dict) -> int:
    c = msg.get("content")
    return sum(1 for b in c if isinstance(b, dict) and b.get("type") not in (None, "text")) if isinstance(c, list) else 0


# CURSOR'S EDIT AND SHELL TOOLS. Cursor's names are its own, and the input key is `path` where
# Claude Code uses `file_path`, so the Claude constants above do not transfer. Measured over the
# 298 transcripts on the author's machine, 4 Sep 2026: `Write` and `StrReplace` are the only tools
# that write a file, they carry `path` on every one of 2,279 blocks, and every one of those paths
# is absolute. `Shell` carries the command string under `command`.
#
# ONE HARNESS, ONE DECLARATION. A tool name is added here, not inferred from a pattern, because a
# reader that guesses which tools write files will silently start counting the wrong thing on the
# next harness release.
_CURSOR_EDIT_TOOLS = {"Write", "StrReplace"}
_CURSOR_SHELL_TOOLS = {"Shell"}


def _cursor_tool_uses(msg: dict):
    """Yield (tool_name, input_dict) for each tool_use block in a Cursor assistant message."""
    content = msg.get("content")
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                yield b.get("name", ""), (b.get("input") or {})


def _region_of(path: str, root: str | None) -> str:
    """The first meaningful path segment, relative to the repository root when there is one.

    Privacy: the region NAME stays local. Only the integer indices from `_route_indices` are ever
    pushed, which is the same contract the Claude Code path has kept since the card shipped.
    """
    rel = path
    if root and path.startswith(root):
        rel = path[len(root):]
    parts = [p for p in rel.split("/") if p and not p.startswith(".")]
    return parts[0] if parts else "root"

# THE AUTHOR'S OWN USERNAME WAS BAKED INTO A PUBLIC TOOL. Until 3 Sep 2026 this was
# `.replace("Users-morkeeth-", "")`: a hardcoded string that cleaned exactly one person's project
# labels and left everyone else's raw. Measured that day — a stranger's Cursor project rendered on
# the card as `Users-alice-code-myapp`, while the same fixture under a `Users-morkeeth-CODE-demo`
# directory rendered as the clean `CODE-demo`.
#
# Cursor and Claude both name a project directory after the absolute path with the separators
# flattened to dashes, so the home prefix is `Users-<whoever>-` on macOS and `home-<whoever>-` on
# Linux. The prefix is derived from that shape, not from a name. `expanduser` is deliberately not
# used: the label has to be right for a transcript copied from another machine, where the home
# directory in the name is not the one this process is running under.
#
# THE TRAILING DASH IS OPTIONAL, and that one character is a shipped leak. A session opened on
# the home directory itself flattens to `-Users-<whoever>` with nothing after the account name,
# the prefix rule missed it for want of a final dash, and the account name became the whole
# label: a real card, 22 Sep 2026, was titled `Users-morkeeth · Cursor sitting`. There is no
# project in that name to preserve, so the label is EMPTY and the caller says "unknown project"
# rather than printing somebody's login.
_HOME_PREFIX = _re.compile(r"^-?(?:Users|home)-[^-]+(?:-|$)")


def project_label(dirname: str) -> str:
    """The project part of a flattened-path directory name, with any user's home prefix removed.

    Returns "" when the directory names a home directory and nothing else: an unknown project is
    a fact the card can state, an account name is not.
    """
    if not dirname:
        return ""
    stripped = _HOME_PREFIX.sub("", dirname)
    if stripped == dirname:
        return dirname
    return stripped


def latest_cursor_session() -> str | None:
    files = glob.glob(os.path.expanduser(CURSOR_GLOB))
    return max(files, key=os.path.getmtime) if files else None

# A store window this many times longer or shorter than the typed-turn window means the store
# composer is not the session in front of us. Measured on 26 real sessions with both windows,
# 16 Sep 2026: the median ratio is 1.02, twenty-five of twenty-six sit inside this band, and the
# one outside it is 620x, a composer resumed weeks later. The band is wide on purpose. It exists
# to catch a different session, not to police a few seconds of clock skew.
_RIDGE_WINDOW_FACTOR = 4


def _store_ridge_is_usable(candidate: dict, store_calls: int, typed_window: float | None) -> bool:
    """Accept the store ridge on structure and on window, never on a count comparison."""
    if store_calls <= 0:
        return False
    if candidate.get("ridge_basis") != "wall-time":
        return False            # no better than the call-order fallback we already have
    wall = candidate.get("ridge_wall_seconds")
    if wall is None or wall <= 0:
        return False            # a zero-length window cannot be plotted against time
    if typed_window:
        ratio = wall / typed_window
        if ratio > _RIDGE_WINDOW_FACTOR or ratio < 1 / _RIDGE_WINDOW_FACTOR:
            return False        # this store composer is a different session
    return True


def parse_cursor_session(path: str, athlete: str = "you", records=None, cursor_db=None) -> dict:
    typed = 0
    tool_calls = 0
    shell_calls = 0
    commits = 0
    commit_call_indices: list[int] = []
    tool_call_index = 0
    stamps = []
    files: set[str] = set()
    written: set[str] = set()
    edits: list[str] = []      # ordered writes, for the repository root
    touched: list[str] = []    # every path a tool named, in order: the route
    first_prompt = None
    best_prompt = None
    ts_re = _re.compile(r"<timestamp>(.*?)</timestamp>")
    uq_re = _re.compile(r"<user_query>(.*?)</user_query>", _re.S)
    from .native_sittings import records as read_records
    for o in records if records is not None else read_records(path):
        role = o.get("role")
        msg = o.get("message") if isinstance(o.get("message"), dict) else {}
        text = _cursor_text(msg)
        if role == "user" and "<user_query>" in text:
            typed += 1
            m = ts_re.search(text)
            if m:
                stamps.append(m.group(1))
            q = uq_re.search(text)
            prompt = (q.group(1).strip() if q else text.strip())
            if first_prompt is None:
                first_prompt = prompt
            # Prefer a longer, assignment-shaped prompt over a two-word kickoff for the card title.
            if best_prompt is None or len(prompt) > len(best_prompt):
                best_prompt = prompt
        elif role == "assistant":
            tool_calls += _cursor_tool_blocks(msg)
            # Cursor claim detection has no resolved harness-specific calibration.
            # Keep claim counts unknown while preserving native activity measurements.
            # THE TRACE. Until 4 Sep 2026 this branch counted tool blocks and threw the rest
            # away, so every Cursor card printed a dash for files touched, commits and
            # artifacts, and reach printed "this harness does not name the repository". All
            # three sentences were false at the object: the paths are in the transcript.
            for name, inp in _cursor_tool_uses(msg):
                this_call_index = tool_call_index
                tool_call_index += 1
                if not isinstance(inp, dict):
                    continue
                if isinstance(inp.get("path"), str) and inp.get("path"):
                    touched.append(inp["path"])
                if name in _CURSOR_EDIT_TOOLS:
                    fp = inp.get("path")
                    if isinstance(fp, str) and fp:
                        files.add(fp)
                        written.add(fp)
                        edits.append(fp)
                elif name in _CURSOR_SHELL_TOOLS:
                    shell_calls += 1
                    if "git commit" in (inp.get("command") or ""):
                        commits += 1
                        commit_call_indices.append(this_call_index)
    if not typed:
        raise ValueError(f"no typed <user_query> turns in {path}")
    # duration from first/last embedded timestamp (best-effort), else None
    dur = None
    from .native_sittings import cursor_time
    pts = [p for p in (cursor_time('<timestamp>'+s+'</timestamp>') for s in stamps) if p]
    if len(pts) >= 2:
        # Wall-clock stamps exist on typed turns, but the Cursor grind trace is ordered by
        # turn position, not elapsed time (capabilities.timed_trace=False). Publishing
        # duration/pace/cadence from the same stamps while the route says spacing is not
        # elapsed time is a false measured-rate claim. Refuse elapsed rates here.
        dur = None
    else:
        dur = None

    # rhythm: bucket typed turns by position (24 buckets) — shape without needing per-turn time
    buckets = min(24, max(1, typed))
    rhythm = [0] * buckets
    for i in range(typed):
        rhythm[min(buckets - 1, i * buckets // typed)] += 1

    proj = project_label(os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(path)))))
    # The longest typed prompt stays local-only for the author; share/card defaults never paste it.
    private_title_prompt = best_prompt or first_prompt

    # THE REPOSITORY, from the files the session actually wrote. Cursor never states a cwd, so the
    # root is the git work tree enclosing the most-edited path. A session that wrote nothing, or
    # wrote only outside a work tree, yields None and reach says so in its own sentence.
    repo_root = None
    if edits:
        ranked = sorted(set(edits), key=lambda p: (-edits.count(p), p))
        for candidate in ranked[:5]:
            found = gitwork.repo_of(candidate)
            if found:
                repo_root = found[1]
                break
    public_project = os.path.basename(repo_root) if repo_root else None

    # Artifacts produced: a path this session wrote that exists on disk when the transcript is
    # parsed. Same definition as the Claude Code path, deliberately, so the two cards mean the
    # same thing by the same word.
    artifacts_produced = sum(1 for fp in written if os.path.exists(fp)) if written else None

    # WHAT LANDED, asked of git over this run's window — the same witness reach uses. The
    # transcript can only count `git commit` shell calls; git can say what those commits were
    # called, and a commit subject is the one outcome sentence a card can print without a person
    # writing one. No repository or no window means no subject, and the card says nothing shipped.
    commits_list = []
    if repo_root and len(pts) >= 2:
        commits_list = [dict(hash=c["hash"], at=c["at"], subject=c["subject"])
                        for c in gitwork.commits_in(repo_root, min(pts), max(pts))]

    # THE TITLE: the repository and the work, never the workspace directory. Until 22 Sep 2026 it
    # was `f"{proj} · Cursor sitting"` over a flattened filesystem path, which printed the
    # author's macOS account name on a card they were asked to share.
    subject = privacy.strip_home_names(commits_list[-1]["subject"]) if commits_list else ""
    task = subject[:80] if subject and not privacy.scan(subject) else "Cursor sitting"
    title = f"{public_project} · {task}" if public_project else task

    # REACH. It needs a repository AND a window. Cursor stamps times on typed turns only, so a
    # single-turn session has no window and reach stays None with the sentence that says why.
    if repo_root and len(pts) >= 2:
        reach_value, reach_reason = reachmod.reach_of(repo_root, min(pts), max(pts))
    elif repo_root:
        reach_value, reach_reason = None, reachmod.R_NO_WINDOW
    elif edits:
        # files were written, none of them inside a work tree that still exists
        reach_value, reach_reason = None, reachmod.R_CWD_NOT_REPO
    else:
        reach_value, reach_reason = None, reachmod.HARNESS_LIMIT["Cursor"]

    route_ix, route_names = folder_route(touched)
    run = {
        "athlete": athlete, "title": title, "harness": "Cursor",
        "project": public_project or proj or None,
        "project_proven": repo_root is not None,
        "parser_version": "cursor-claims-unknown-2026-09-14",
        "project_identity": project_identity(repo_root),
        "started": (min(pts).isoformat() if pts else None),
        "trace_basis": "typed-turn order; spacing is not elapsed time; sessions split on human-turn gaps, not measured idle",
        "capabilities": {"timed_trace": False, "claim_evidence": False, "authorship": True},
        "duration_s": dur, "turns_typed": typed, "tool_calls": tool_calls,
        "shell_calls": shell_calls,
        "files_touched": len(files) if files else None,
        # Cursor's `files` set only ever holds paths a write tool named, so touched and changed
        # are the same population here. The card needs the stronger word to be earned, so it is
        # recorded under its own key rather than relabelled at render time.
        "files_changed": len(written) if written else None,
        "commits": commits if edits or commits else None,
        # hash, time and subject only. No file names, and no path ever reaches this list.
        "commits_list": commits_list,
        "rhythm": rhythm,
        "artifacts_produced": artifacts_produced,
        "artifacts_promised": None,   # no harness records what a run said it would deliver
        "corrections": None,          # the inverse class, not built
        "reach": reach_value, "reach_reason": reach_reason,
        "route": route_ix,                   # integers only, safe to publish
        "route_legend": route_names,         # folder names, LOCAL only, never pushed
        "private_title_prompt": private_title_prompt,  # LOCAL only — never a share default
    }
    # Cursor transcript JSONL has no agent event clock. Its local SQLite store does: bubble
    # createdAt. Read only the allowlisted structure, and fall back to call order if this export
    # was copied from another machine or any tool bubble lacks a timestamp.
    #
    # THIS USED TO REQUIRE sum(ridge) == tool_calls, AND THAT CAN NEVER HOLD ON REAL DATA.
    # The store counts tool requests in the store's own vocabulary and the transcript counts
    # them in the harness vocabulary. One measured session shows the store saying edit_file_v2
    # 32 times where the transcript says Write 23 plus StrReplace 2. Measured on this author's
    # real store, 16 Sep 2026, over the 46 transcripts whose composer exists in the store: only
    # 17 passed the equality, and the relative gap ran from -0.51 to +14.9. Every synthetic
    # fixture passed because both sides were generated from one list, which is how the defect
    # shipped. A run that lost the gate printed Wall time Unknown for a real 33 hour session.
    #
    # SECOND, AND WHY THIS READS TWO STORES. Cursor stopped writing agent sessions into the one
    # global state.vscdb. Each session now gets its own file under ~/.cursor/chats. Measured here on
    # 16 Sep 2026 over 362 transcript composer ids: the global store holds 46 and NONE of the newest
    # 100, the chat store holds 316 and ALL of the newest 100. The 46 are dated 24 Feb to 16 Aug and
    # the 316 are dated 10 Aug to today, with zero overlap, so the move was in mid August. A capture
    # that reads only the global
    # store is therefore blind to everything a user did this week, which is every session they care
    # about. The chat store is tried first, the global store second, call order last, and
    # ridge_source names which one answered so a card never implies a clock it did not read.
    from . import cursor_chats, cursor_tree
    ridge = cursor_tree.ridge_from_calls(
        [None] * tool_calls, commit_call_indices=commit_call_indices)
    ridge_source = 'call-index'
    composer_id = Path(path).parent.name
    source = Path(cursor_db).expanduser() if cursor_db is not None else cursor_tree.db_path()
    # The typed-turn window, in seconds. The transcript has no agent event clock, but it does
    # stamp typed turns, and that window is the one quantity both sides measure in the same
    # unit. It is the only honest cross-check on the store's window.
    typed_window = round((max(pts) - min(pts)).total_seconds(), 1) if len(pts) >= 2 else None
    store_calls = None
    try:
        candidate = cursor_chats.build_ridge(composer_id)
    except (KeyError, OSError, sqlite3.DatabaseError, ValueError):
        candidate = None
    if candidate is not None:
        chat_calls = sum(candidate["ridge"])
        if _store_ridge_is_usable(candidate, chat_calls, typed_window):
            ridge = candidate
            store_calls = chat_calls
            ridge_source = "cursor-chat-store"
    if ridge_source == "call-index" and source.is_file():
        try:
            with cursor_tree.CopiedDb(source) as conn:
                candidate = cursor_tree.build_ridge(
                    conn, composer_id, commit_call_indices=commit_call_indices)
                store_calls = sum(candidate["ridge"])
                if _store_ridge_is_usable(candidate, store_calls, typed_window):
                    ridge = candidate
                    ridge_source = "cursor-global-store"
                    run["tree"] = cursor_tree.build_tree(conn, composer_id)
        except (KeyError, OSError, sqlite3.DatabaseError, ValueError):
            pass
    run.update(ridge)
    # Which store answered. LOCAL only: it is not one of the columns the browser Save path sends,
    # and migration 003 constrains ridge_basis to wall-time or call-index, so this never travels.
    run["ridge_source"] = ridge_source
    # Record the disagreement, never act on it. The store counts tool requests in its own
    # vocabulary, the transcript counts them in the harness vocabulary, and the two never match
    # exactly on real data. The delta is derived from tool_calls, so it needs no second field.
    run["ridge_tool_calls"] = store_calls if ridge.get("ridge_basis") == "wall-time" else None
    if ridge["ridge_basis"] == "wall-time":
        run["duration_s"] = ridge["ridge_wall_seconds"]
        run["capabilities"]["timed_ridge"] = True
    else:
        run["capabilities"]["timed_ridge"] = False
    from .code_route import attach_measured_code_route
    from .capture_metadata import recorded
    from .native_sittings import records as read_records
    run["capture_metadata"] = recorded(records if records is not None else read_records(path), "cursor")
    return attach_measured_code_route(run)


# ---- Grok Bot origin ---------------------------------------------------------
# Measured export shape (14 Sep 2026): JSONL records with role user|assistant|tool
# and message.content blocks. A typed human turn is stricter than role=user: its text
# must contain both a timestamp and a user_query wrapper. Injected user records without
# user_query are not typed turns. The export has no top-level clock or working directory.


def grokbot_session_files() -> list[str]:
    """Explicitly imported Grok Bot exports, newest first."""
    files = glob.glob(os.path.expanduser(GROKBOT_GLOB))
    return sorted(
        (path for path in files if os.path.isfile(path)),
        key=os.path.getmtime,
        reverse=True,
    )


def latest_grokbot_session() -> str | None:
    """Newest imported Grok Bot export containing a typed human turn."""
    from .native_sittings import records
    for path in grokbot_session_files():
        try:
            for row in records(path):
                msg = row.get("message") if isinstance(row.get("message"), dict) else {}
                text = _cursor_text(msg)
                if (
                    row.get("role") == "user"
                    and "<timestamp>" in text
                    and "<user_query>" in text
                ):
                    return path
        except OSError:
            continue
    return None


def parse_grokbot_session(path: str, athlete: str = "you", records=None) -> dict:
    """Parse a measured Grok Bot JSONL export without inferring absent measurements."""
    from .native_sittings import cursor_time, records as read_records

    sample = False
    typed = 0
    tool_calls = 0
    shell_calls = 0
    tools_per_turn: list[int] = []
    current_turn_tools: int | None = None
    stamps: list[datetime] = []
    workdirs: list[str] = []
    first_prompt = None
    uq_re = _re.compile(r"<user_query>(.*?)</user_query>", _re.S)

    for row in records if records is not None else read_records(path):
        sample = sample or row.get("agentgrinder_sample") is True
        role = row.get("role")
        msg = row.get("message") if isinstance(row.get("message"), dict) else {}
        text = _cursor_text(msg)
        if role == "user" and "<timestamp>" in text and "<user_query>" in text:
            if current_turn_tools is not None:
                tools_per_turn.append(current_turn_tools)
            current_turn_tools = 0
            typed += 1
            stamp = cursor_time(text)
            if stamp:
                stamps.append(stamp)
            if first_prompt is None:
                match = uq_re.search(text)
                first_prompt = (match.group(1).strip() if match else text.strip())
        elif role == "assistant" and current_turn_tools is not None:
            for name, inputs in _cursor_tool_uses(msg):
                tool_calls += 1
                current_turn_tools += 1
                if name in _CURSOR_SHELL_TOOLS:
                    shell_calls += 1
                    workdir = inputs.get("working_directory") if isinstance(inputs, dict) else None
                    if isinstance(workdir, str) and workdir:
                        workdirs.append(workdir)
    if current_turn_tools is not None:
        tools_per_turn.append(current_turn_tools)

    if not typed:
        raise ValueError(f"no typed <timestamp> and <user_query> turns in {path}")

    # The export timestamps typed turns, not agent events. They establish when the sitting
    # began and can split sittings, but they do not establish duration, pace, or timed trace.
    rhythm = [1] * typed
    repo_root = None
    if not sample:
        for workdir in workdirs:
            found = gitwork.repo_of(workdir)
            if found:
                repo_root = found[1]
                break
    project = os.path.basename(repo_root) if repo_root else None
    # THE RIDGE IS DRAWN ON TYPED-TURN ORDER. Measured on three real Grok Bot exports on
    # 16 Sep 2026: the only clock in the file is the <timestamp> tag on typed user turns,
    # at minute resolution. No tool_use block carries a time. Call-index with fewer than
    # 50 calls spreads evenly and draws a flat 1 and 0 comb. That comb is not a shape.
    # Tool counts per typed turn on brief-v2-export-a.jsonl were 1, 2, 5, 13, 0, 7.
    # ridge_basis is turn-order. Wall seconds stay unknown.
    from . import cursor_tree
    ridge = cursor_tree.ridge_from_turn_order(tools_per_turn)
    run = {
        "athlete": athlete,
        "title": "Grok Bot session",
        "harness": "Grok Bot",
        "activity_label": "bot activity",
        "is_sample": sample,
        "project": project,
        "project_identity": project_identity(repo_root),
        "parser_version": "grokbot-export-2026-09-14",
        "started": min(stamps).isoformat() if stamps else None,
        "trace_basis": "typed-turn order; Grok Bot export has no top-level event timestamps",
        "capabilities": {"timed_trace": False, "authorship": True},
        "duration_s": None,
        "turns_typed": typed,
        "tool_calls": tool_calls,
        "shell_calls": shell_calls,
        # Shell, Read and tool-result blocks are observed. No native edit tool was observed,
        # and parsing shell command text as writes would guess at shell semantics.
        "files_touched": None,
        # A shell request is not a completed commit. The measured export does not
        # establish request/result identity, so successful commits remain unknown.
        "commits": None,
        "rhythm": rhythm,
        "claims": None,
        "claims_verified": None,
        "artifacts_produced": None,
        "artifacts_promised": None,
        "corrections": None,
        "reach": None,
        "reach_reason": reachmod.R_NO_REPO,
        "route": [],
        "route_legend": [],
        "private_title_prompt": first_prompt,
    }
    run.update(ridge)
    run["ridge_source"] = "turn-order"   # LOCAL only, never one of the Save columns
    run["ridge_tool_calls"] = None       # no store was read, so there is no second count
    run["capabilities"]["timed_ridge"] = False
    return run


# ---- Codex origin ------------------------------------------------------------
# rollout-*.jsonl — event_msg user_message = human turn.
#
# WHERE CODEX ACTUALLY WRITES. Until 3 Sep 2026 this globbed `~/.codex/archived_sessions/*.jsonl`
# only, flat and non-recursive. Codex CLI writes live sessions to
# `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` and archives a fraction of them. Measured on the
# author's own machine that day: the shipped glob saw 16 files, the real tree held 64. A person
# who has just started with Codex has no archived sessions at all, so every Codex command
# returned "nothing to read" while their transcripts sat on disk.
_INJECT_MARKERS = ("<recommended_plugins>", "<environment_context>", "<turn_aborted>")

CODEX_GLOBS = (
    "~/.codex/sessions/**/*.jsonl",      # where live sessions land, nested by date
    "~/.codex/archived_sessions/*.jsonl",  # where some of them are moved later
)


def codex_session_files() -> list[str]:
    """Every Codex rollout on this machine, both trees, newest first, no duplicates."""
    seen: dict[str, float] = {}
    for pat in CODEX_GLOBS:
        for f in glob.glob(os.path.expanduser(pat), recursive=True):
            if f in seen or not os.path.isfile(f):
                continue
            try:
                seen[f] = os.path.getmtime(f)
            except OSError:
                continue
    return sorted(seen, key=lambda f: seen[f], reverse=True)


def latest_codex_session() -> str | None:
    """The newest Codex rollout THAT A PERSON TYPED IN, newest first.

    It used to return `files[0]`, the newest rollout by modification time, whether or not anybody
    typed in it. Codex writes a rollout for work with no human turn in it at all, so on 4 Sep 2026
    the newest file on this machine had zero typed turns, `parse_codex_session` raised, and the
    CLI printed a Python traceback at a person who had done nothing wrong. Skipping to the newest
    rollout with a human turn is what the Claude Code path has always done through
    `human_sittings`. `None` still means there is nothing to read, and the CLI says so in words.
    """
    for path in codex_session_files():
        if _codex_count(path):
            return path
    return None


def _codex_count(path: str) -> tuple[int, int] | None:
    """Count native events, independent of whitespace and without tool-result duplicates."""
    from .native_trace import codex_activity
    try:
        activity = codex_activity(path)
    except OSError:
        return None
    return (activity['typed'], activity['tools']) if activity['typed'] else None


# CODEX WRITES FILES THROUGH ONE EVENT, AND IT NAMES THEM. `patch_apply_end` carries
# `changes`, a dict keyed by absolute path, and a `success` boolean. Measured over the 81 rollouts
# on the author's machine, 4 Sep 2026: 69 changed paths, all absolute, 67 of them still on disk.
# Shell work arrives as `custom_tool_call` with `name` "exec" and the command in `input`.
# Every record carries a top-level ISO timestamp, so a session window can be drawn.
#
# A FAILED PATCH IS NOT A WRITE. Only `success` true is counted, because a card that counts an
# attempt as an artifact is the ceiling problem again in a different column.
def _codex_command(blob) -> str:
    """The shell command inside a Codex `exec` call, as one string.

    `input` is a JSON string. Codex passes the command either as a list under `cmd` or `command`,
    or as a plain string. A list has to be JOINED before it is searched: the raw JSON of
    `["git","commit"]` does not contain the substring `git commit`, so matching the blob directly
    misses every commit made through the list form and reports a confident zero.
    """
    if not isinstance(blob, str):
        return ""
    try:
        parsed = json.loads(blob)
    except (ValueError, json.JSONDecodeError):
        return blob
    if isinstance(parsed, dict):
        cmd = parsed.get("cmd", parsed.get("command"))
        if isinstance(cmd, list):
            return " ".join(str(part) for part in cmd)
        if isinstance(cmd, str):
            return cmd
    return blob


def _codex_scan(path: str, records=None):
    """One pass for the trace: (written paths in order, commits, timestamps, cwd).

    Separate from `_codex_count` on purpose. That function exists because Codex writes megabyte
    lines and a substring scan is far cheaper than json.loads on every one; it stays exactly as
    it was, so the turn and tool counts this card has always printed do not move.
    """
    edits: list[str] = []
    commits = 0
    stamps: list[datetime] = []
    cwd = None
    from .native_sittings import records as read_records
    try:
        for o in records if records is not None else read_records(path):
            ts = o.get("timestamp")
            if isinstance(ts, str):
                try:
                    stamps.append(datetime.fromisoformat(ts.replace("Z", "+00:00")))
                except ValueError:
                    pass
            p = o.get("payload")
            if not isinstance(p, dict):
                continue
            if o.get("type") == "session_meta" and cwd is None:
                cwd = p.get("cwd")
            elif p.get("type") == "patch_apply_end" and p.get("success") is True:
                changes = p.get("changes")
                if isinstance(changes, dict):
                    for changed in changes:
                        if isinstance(changed, str) and changed:
                            edits.append(changed)
            elif p.get("type") == "custom_tool_call" and p.get("name") == "exec":
                if "git commit" in _codex_command(p.get("input")):
                    commits += 1
    except OSError:
        pass
    return edits, commits, stamps, cwd


def parse_codex_session(path: str, athlete: str = "you", records=None) -> dict:
    from .native_trace import codex_activity
    from .native_sittings import records as read_records
    from .capture_metadata import recorded
    records = list(records) if records is not None else list(read_records(path))
    native = codex_activity(path, records=records)
    hit = (native['typed'], native['tools']) if native['typed'] else None
    if not hit:
        raise ValueError(f"no human user_message turns in {path}")
    typed, tool_calls = hit
    edits, commits, stamps, cwd = _codex_scan(path, records=records)
    written = set(edits)
    files = set(edits)

    rhythm = native["rhythm"]

    proj = os.path.basename(cwd) if cwd else os.path.basename(path).replace(".jsonl", "")[:32]
    title = f"{proj} session"

    repo_root = None
    found = gitwork.repo_of(cwd) if cwd and os.path.isdir(cwd) else None
    if found:
        repo_root = found[1]

    artifacts_produced = sum(1 for fp in written if os.path.exists(fp)) if written else None

    # Each branch names the fact that is actually missing. Codex always records a cwd and always
    # stamps times, so "this harness cannot" is never the honest sentence here.
    if repo_root and len(stamps) >= 2:
        reach_value, reach_reason = reachmod.reach_of(repo_root, min(stamps), max(stamps))
    elif len(stamps) < 2:
        reach_value, reach_reason = None, reachmod.R_NO_WINDOW
    elif cwd and not os.path.isdir(cwd):
        reach_value, reach_reason = None, reachmod.R_CWD_GONE
    else:
        reach_value, reach_reason = None, reachmod.R_CWD_NOT_REPO

    route_ix, route_names = folder_route(edits)
    from .code_route import attach_measured_code_route

    return attach_measured_code_route({
        "athlete": athlete,
        "title": title,
        "harness": "Codex",
        "capture_metadata": recorded(records, "codex"),
        "project_identity": project_identity(cwd),
        "parser_version": "codex-sittings-2026-09-05" if records is not None else "codex-native-2026-09-04",
        "authorship": native["authorship"],
        "trace": native["trace"],
        "trace_basis": native["trace_basis"],
        "capabilities": {"timed_trace": bool(native["trace"]), "claim_evidence": False, "authorship": True},
        "project": proj,
        "started": (min(stamps).isoformat() if stamps else None),
        "duration_s": (int((max(stamps) - min(stamps)).total_seconds()) if len(stamps) >= 2 else None),
        "turns_typed": typed,
        "tool_calls": tool_calls,
        "files_touched": len(files) if files else None,
        "commits": commits if edits or commits else None,
        "rhythm": rhythm,
        "artifacts_produced": artifacts_produced,
        "artifacts_promised": None,
        "corrections": None,
        "reach": reach_value,
        "reach_reason": reach_reason,
        "route": route_ix,
        "route_legend": route_names,
    })


def _dedupe(seq):
    seen, out = set(), []
    for x in seq:
        if x not in seen: seen.add(x); out.append(x)
    return out

def _route_indices(route):
    """Map the ordered region names to small integers — the publishable, name-free path."""
    order = {r: i for i, r in enumerate(_dedupe(route))}
    return [order[r] for r in route]


# ---- coach: light cross-session history (local only, privacy-safe) -----------
def _quick_stats(path: str):
    """Cheap parse of one Claude session: (date, typed_count, duration_s). No content read into memory."""
    typed_ts, all_ts = [], []
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line: continue
                try: o = json.loads(line)
                except json.JSONDecodeError: continue
                t = _ts(o)
                if t: all_ts.append(t)
                if is_human_turn(o) and t:
                    typed_ts.append(t)
    except OSError:
        return None
    if not typed_ts: return None
    return (min(typed_ts).date(), len(typed_ts), (max(all_ts)-min(typed_ts)).total_seconds() if all_ts else 0)

def scan_history(limit: int = 150):
    files = sorted(glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")),
                   key=os.path.getmtime, reverse=True)[:limit]
    out = []
    for f in files:
        st = _quick_stats(f)
        if st: out.append(st)
    return out  # recent sessions: (date, typed, duration_s)

def best_recent_session(n: int = 12) -> str | None:
    """Pick the most substantial (most typed turns) among the n most-recently-modified sessions."""
    files = sorted(glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")), key=os.path.getmtime, reverse=True)[:n]
    best, best_typed = None, -1
    for f in files:
        st = _quick_stats(f)
        if st and st[1] > best_typed:
            best, best_typed = f, st[1]
    return best

def coach_lines(this_run: dict) -> list[str]:
    """Sober performance insight from local history. No streaks, no gamification. Numbers only."""
    hist = scan_history()  # (date, typed, duration_s)
    if len(hist) < 2:
        return []
    durs = sorted((h[2] for h in hist), reverse=True)
    prompts = sorted((h[1] for h in hist), reverse=True)
    # median cadence (prompts/hour) across history
    cads = [h[1] / (h[2] / 3600) for h in hist if h[2] > 300]
    med_cad = sorted(cads)[len(cads) // 2] if cads else 0
    d = this_run.get("duration_s") or 0
    tp = this_run.get("turns_typed") or 0
    tc = this_run.get("tool_calls") or 0
    commits = this_run.get("commits") or 0
    regions = len(set(this_run.get("route") or []))
    rig = this_run.get("rig") or {}
    graded, described = [], []
    # VERIFIED self-comparison: a true rank of active time
    if d and durs:
        rank = 1 + sum(1 for x in durs if x > d)
        if rank <= 3: graded.append(f"one of your longest focus sessions (#{rank} of {len(durs)})")
    # GROUNDED + CITED, most actionable first
    if this_run.get("has_rules") is False and this_run.get("project"):
        graded.append("no CLAUDE.md/rules file here - a rules file cut agent errors ~41%->11% (Karpathy)")
    elif this_run.get("rules_lines") and this_run["rules_lines"] < 15:
        graded.append(f"your rules file is only {this_run['rules_lines']} lines - thin rules leave the agent guessing (Karpathy/Osmani)")
    if this_run.get("has_plan") is False and this_run.get("project") and tp >= 8:
        graded.append("no plan/spec.md in this project - plan first, save the spec (Hashimoto/Willison)")
    if tc >= 40 and commits == 0:
        graded.append(f"{tc} tool calls, 0 commits - commit per unit of work (Huntley/Willison)")
    elif tp >= 8 and commits and commits < max(1, tp // 20):
        graded.append("few commits for the prompts - commit per unit of work, don't batch (Huntley)")
    if regions >= 5 and tp and regions > tp / 4:
        graded.append(f"touched {regions} regions - one bounded objective per session (Willison)")
    if rig.get("mcps") == 0 and rig.get("skills") == 0:
        graded.append("no MCPs or skills in your rig - a real setup is the cheap edge")
    # DESCRIPTIVE (real ratio, not a verdict) - only if room
    if tp and tc: described.append(f"{round(tc/tp,1)} tool calls per prompt this session")
    return (graded + described)[:4]

def detect_rig() -> dict:
    """Your setup, from local config. Non-sensitive: counts of MCPs + skills. Names stay local."""
    import json as _j
    mcps = skills = 0; mcp_names = []
    for cfg in (os.path.expanduser("~/.claude.json"), os.path.expanduser("~/.claude/settings.json")):
        try:
            d = _j.load(open(cfg))
            m = d.get("mcpServers") or {}
            if m: mcp_names = list(m.keys()); mcps = len(m); break
        except (OSError, ValueError): pass
    sk = os.path.expanduser("~/.claude/skills")
    if os.path.isdir(sk):
        skills = sum(1 for e in os.listdir(sk) if os.path.isdir(os.path.join(sk, e)))
    return {"mcps": mcps, "skills": skills, "mcp_names": mcp_names}
