"""Bounded Code Route payload — the Strava GPS equivalent for agent work.

Public bytes may carry repository names only when the uploader explicitly includes them.
Absolute paths, home paths, prompts, secrets and private lane names are rejected.
Uploader-declared outcomes stay separate from measured route stops via each stop's basis.
"""
from __future__ import annotations

import re
from typing import Any

SCHEMA = 1
STOP_KINDS = frozenset(
    {"edit", "commit", "check", "merge", "deploy", "artifact", "handoff", "finish"}
)
BASIS = frozenset({"measured", "declared"})
FINISH_KINDS = frozenset({"artifact", "unfinished"})
HARNESS_BASIS = frozenset({"manifest", "collector"})
MAX_PROJECTS = 12
MAX_STOPS = 40
MAX_CONNECTORS = 40
MAX_HARNESSES = 12
MAX_ID = 40
MAX_LABEL = 80
MAX_WHY = 160
MAX_EVIDENCE = 5
MAX_EVIDENCE_LEN = 120

_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$")
_LABEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._+/@#:-]{0,79}$")
_HARNESS = re.compile(r"^[a-z][a-z0-9-]{0,31}$")
_PATHISH = re.compile(
    r"(^|[\\s\"'])(/Users/|/home/|/private/|~[/\\\\]|[A-Za-z]:\\\\|\\\\)"
)
_SECRETISH = re.compile(
    r"(?i)(api[_-]?key|secret|password|token|bearer\s+[a-z0-9]|sk-[a-z0-9]{8,}|prompt\s*:)"
)
# Private fleet lane briefs ("L12", "PRIVATE LANE") must never travel as public labels.
_PRIVATE_LANE = re.compile(r"(?i)(\bL\d+\b|\bprivate\b|\blane\s+[a-z0-9-]+)")
_ALLOWED_TOP = frozenset(
    {"v", "projects", "stops", "connectors", "finish", "stats", "harnesses", "unavailable"}
)
_ALLOWED_PROJECT = frozenset({"id", "label", "basis"})
_ALLOWED_STOP = frozenset({"id", "project", "kind", "label", "basis", "evidence", "source"})
_ALLOWED_CONNECTOR = frozenset({"from", "to", "kind", "label"})
_ALLOWED_FINISH = frozenset({"stop", "kind", "label"})
_ALLOWED_STATS = frozenset(
    {
        "projects_touched",
        "commits",
        "files_changed",
        "verified_checkpoints",
        "shipped_artifacts",
    }
)
_ALLOWED_HARNESSES = frozenset({"observed", "absent", "basis"})
_ALLOWED_UNAVAILABLE = frozenset({"why"})


def _bad(msg: str) -> None:
    raise ValueError(msg)


def _reject_text(value: str, field: str) -> str:
    if not isinstance(value, str):
        _bad(f"{field} must be text.")
    text = value.strip()
    if not text:
        _bad(f"{field} must not be empty.")
    if _PATHISH.search(text) or "/" in text and text.startswith("/"):
        _bad(f"{field} must not contain absolute or home paths.")
    if "\\" in text or text.startswith("~"):
        _bad(f"{field} must not contain path separators.")
    if _SECRETISH.search(text):
        _bad(f"{field} must not carry prompts or secrets.")
    if _PRIVATE_LANE.search(text):
        _bad(f"{field} must not carry private lane labels.")
    return text


def _id(value: Any, field: str) -> str:
    text = _reject_text(value, field)
    if len(text) > MAX_ID or not _ID.match(text):
        _bad(f"{field} must be a short safe id.")
    return text


def _label(value: Any, field: str, *, limit: int = MAX_LABEL) -> str:
    text = _reject_text(value, field)
    if len(text) > limit or not _LABEL.match(text):
        _bad(f"{field} must be a short safe label.")
    return text


def _count(value: Any, field: str) -> int:
    if type(value) is not int or value < 0 or value > 1_000_000:
        _bad(f"{field} must be a non-negative whole number.")
    return value


def _keys(obj: dict, allowed: frozenset, name: str) -> None:
    unknown = set(obj) - allowed
    if unknown:
        _bad(f"Unknown {name} key: {sorted(unknown)[0]}")


def _source_text(value: Any, field: str) -> str:
    text = _reject_text(value, field)
    if re.search(r'''(?:^|[\s"'])(?:/(?:Users|home|private)/|~[/\\]|[A-Za-z]:[\\/])''', text):
        _bad(f'{field} must not include home or absolute paths.')
    if re.search(r'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)', text):
        _bad(f'{field} must not include credential-shaped text.')
    return text


def validate_checkpoint_source(value: Any) -> dict:
    """Optional consented landmark details; never infer a result from Git descriptions."""
    if not isinstance(value, dict):
        _bad('stop.source must be an object.')
    _keys(value, frozenset({'v', 'consent', 'commits', 'files_changed', 'files'}), 'stop.source')
    if type(value.get('v')) is not int or value['v'] != 1 or value.get('consent') != 'explicit':
        _bad('stop.source requires version 1 and explicit consent.')
    count = _count(value.get('files_changed'), 'stop.source.files_changed')
    commits = value.get('commits')
    if not isinstance(commits, list) or len(commits) > 5:
        _bad('stop.source.commits holds at most 5 commits.')
    result = {'v': 1, 'consent': 'explicit', 'commits': [], 'files_changed': count}
    seen = set()
    for commit in commits:
        if not isinstance(commit, dict):
            _bad('each source commit must be an object.')
        _keys(commit, frozenset({'sha', 'subject', 'url'}), 'source commit')
        digest = commit.get('sha')
        if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{40}', digest) or digest in seen:
            _bad('source commits require unique lowercase Git SHA1 hashes.')
        seen.add(digest)
        item = {'sha': digest}
        if 'subject' in commit:
            subject = _source_text(commit['subject'], 'commit.subject')
            if subject != commit['subject'] or len(subject) > 160 or not re.fullmatch(r'[ -~]+', subject):
                _bad('commit.subject must be exact printable text of at most 160 characters.')
            item['subject'] = subject
        if 'url' in commit:
            url = _source_text(commit['url'], 'commit.url')
            match = re.fullmatch(r'https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/commit/([0-9a-f]{40})', url)
            if not match or match[1] in ('.', '..') or match[2] in ('.', '..') or match[3] != digest:
                _bad('commit.url must identify that exact commit on public GitHub.')
            item['url'] = url
        result['commits'].append(item)
    if 'files' in value:
        files = value['files']
        if not isinstance(files, list) or len(files) > min(20, count):
            _bad('source.files holds at most 20 names within the observed change count.')
        result['files'] = []
        for name in files:
            original = name
            name = _source_text(name, 'source.files')
            if name != original or len(name) > 160 or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*(/[A-Za-z0-9_][A-Za-z0-9_.-]*)*', name) or name in result['files']:
                _bad('source.files requires unique safe repository-relative names.')
            result['files'].append(name)
    return result


def validate_code_route(value: Any) -> dict:
    """Validate and return a normalised public Code Route object."""
    if value is None:
        _bad("code_route is missing.")
    if not isinstance(value, dict) or isinstance(value, list):
        _bad("code_route must be an object.")
    _keys(value, _ALLOWED_TOP, "code_route")
    if value.get("v") != SCHEMA:
        _bad("code_route.v must be 1.")

    unavailable = value.get("unavailable")
    if unavailable is not None:
        if not isinstance(unavailable, dict):
            _bad("unavailable must be an object.")
        _keys(unavailable, _ALLOWED_UNAVAILABLE, "unavailable")
        why = _reject_text(unavailable.get("why"), "unavailable.why")
        if len(why) > MAX_WHY:
            _bad("unavailable.why is too long.")
        # An unavailable route carries no fabricated terrain.
        for key in ("projects", "stops", "connectors", "finish", "stats"):
            if value.get(key) not in (None, [], {}):
                _bad("unavailable code_route cannot also carry route terrain.")
        out = {"v": SCHEMA, "unavailable": {"why": why}}
        harnesses = value.get("harnesses")
        if harnesses is not None:
            out["harnesses"] = _harnesses(harnesses)
        return out

    projects = value.get("projects")
    stops = value.get("stops")
    if not isinstance(projects, list) or not projects or len(projects) > MAX_PROJECTS:
        _bad(f"projects holds 1 to {MAX_PROJECTS} lanes.")
    if not isinstance(stops, list) or not stops or len(stops) > MAX_STOPS:
        _bad(f"stops holds 1 to {MAX_STOPS} checkpoints.")

    project_ids: list[str] = []
    normalised_projects = []
    for project in projects:
        if not isinstance(project, dict):
            _bad("each project is an object.")
        _keys(project, _ALLOWED_PROJECT, "project")
        pid = _id(project.get("id"), "project.id")
        if pid in project_ids:
            _bad("project ids must be unique.")
        project_ids.append(pid)
        basis = project.get("basis", "measured")
        if basis not in BASIS:
            _bad("project.basis must be measured or declared.")
        normalised_projects.append(
            {"id": pid, "label": _label(project.get("label"), "project.label"), "basis": basis}
        )

    stop_ids: list[str] = []
    normalised_stops = []
    for stop in stops:
        if not isinstance(stop, dict):
            _bad("each stop is an object.")
        _keys(stop, _ALLOWED_STOP, "stop")
        sid = _id(stop.get("id"), "stop.id")
        if sid in stop_ids:
            _bad("stop ids must be unique.")
        stop_ids.append(sid)
        project = stop.get("project")
        if project not in project_ids:
            _bad("each stop must name a known project.")
        kind = stop.get("kind")
        if kind not in STOP_KINDS:
            _bad("stop.kind is unsupported.")
        basis = stop.get("basis")
        if basis not in BASIS:
            _bad("stop.basis must be measured or declared.")
        entry = {
            "id": sid,
            "project": project,
            "kind": kind,
            "label": _label(stop.get("label"), "stop.label"),
            "basis": basis,
        }
        evidence = stop.get("evidence")
        if evidence is not None:
            if not isinstance(evidence, list) or len(evidence) > MAX_EVIDENCE:
                _bad(f"stop.evidence holds at most {MAX_EVIDENCE} lines.")
            lines = []
            for line in evidence:
                text = _reject_text(line, "stop.evidence")
                if len(text) > MAX_EVIDENCE_LEN:
                    _bad("stop.evidence lines are too long.")
                lines.append(text)
            entry["evidence"] = lines
        if 'source' in stop:
            if basis != 'measured':
                _bad('stop.source requires a measured checkpoint.')
            entry['source'] = validate_checkpoint_source(stop['source'])
            commits = entry['source']['commits']
            if kind == 'edit' and commits:
                _bad('An edit checkpoint cannot attach commit descriptions.')
            if kind == 'commit' and not any('Git commit: '+item['sha'] in entry.get('evidence', []) for item in commits):
                _bad('Source commits must include the exact checkpoint evidence SHA.')
        normalised_stops.append(entry)

    connectors = value.get("connectors") or []
    if not isinstance(connectors, list) or len(connectors) > MAX_CONNECTORS:
        _bad(f"connectors holds at most {MAX_CONNECTORS} links.")
    normalised_connectors = []
    for link in connectors:
        if not isinstance(link, dict):
            _bad("each connector is an object.")
        _keys(link, _ALLOWED_CONNECTOR, "connector")
        frm, to = link.get("from"), link.get("to")
        if frm not in stop_ids or to not in stop_ids:
            _bad("connectors must join known stops.")
        kind = link.get("kind", "handoff")
        if kind not in ("handoff", "continue"):
            _bad("connector.kind must be handoff or continue.")
        normalised_connectors.append(
            {
                "from": frm,
                "to": to,
                "kind": kind,
                "label": _label(link.get("label"), "connector.label"),
            }
        )

    finish = value.get("finish")
    if not isinstance(finish, dict):
        _bad("finish is required.")
    _keys(finish, _ALLOWED_FINISH, "finish")
    if finish.get("stop") not in stop_ids:
        _bad("finish.stop must name a known stop.")
    if finish.get("kind") not in FINISH_KINDS:
        _bad("finish.kind must be artifact or unfinished.")
    normalised_finish = {
        "stop": finish["stop"],
        "kind": finish["kind"],
        "label": _label(finish.get("label"), "finish.label"),
    }

    stats = value.get("stats")
    if stats is None:
        verified = sum(1 for s in normalised_stops if s["basis"] == "measured")
        stats = {
            "projects_touched": len(normalised_projects),
            "commits": sum(1 for s in normalised_stops if s["kind"] == "commit"),
            "files_changed": 0,
            "verified_checkpoints": verified,
            "shipped_artifacts": sum(1 for s in normalised_stops if s["kind"] == "artifact"),
        }
    if not isinstance(stats, dict):
        _bad("stats must be an object.")
    _keys(stats, _ALLOWED_STATS, "stats")
    normalised_stats = {k: _count(stats[k], f"stats.{k}") for k in sorted(_ALLOWED_STATS) if k in stats}

    out = {
        "v": SCHEMA,
        "projects": normalised_projects,
        "stops": normalised_stops,
        "connectors": normalised_connectors,
        "finish": normalised_finish,
        "stats": normalised_stats,
    }
    harnesses = value.get("harnesses")
    if harnesses is not None:
        out["harnesses"] = _harnesses(harnesses)
    return out


def _harnesses(value: Any) -> dict:
    if not isinstance(value, dict):
        _bad("harnesses must be an object.")
    _keys(value, _ALLOWED_HARNESSES, "harnesses")
    observed = value.get("observed")
    absent = value.get("absent")
    if not isinstance(observed, list) or len(observed) > MAX_HARNESSES:
        _bad(f"harnesses.observed holds at most {MAX_HARNESSES} ids.")
    if not isinstance(absent, list) or len(absent) > MAX_HARNESSES:
        _bad(f"harnesses.absent holds at most {MAX_HARNESSES} ids.")
    if not observed and not absent:
        _bad("harnesses must name at least one observed or absent population.")
    basis = value.get("basis")
    if basis not in HARNESS_BASIS:
        _bad("harnesses.basis must be manifest or collector.")

    def clean(items: list) -> list[str]:
        out = []
        for item in items:
            text = _reject_text(item, "harness id")
            if not _HARNESS.match(text):
                _bad("harness ids are lowercase public population names.")
            if text in out:
                _bad("harness ids must be unique within a list.")
            out.append(text)
        return out

    obs, abs_ = clean(observed), clean(absent)
    overlap = set(obs) & set(abs_)
    if overlap:
        _bad("a harness cannot be both observed and absent.")
    return {"observed": obs, "absent": abs_, "basis": basis}


def public_code_route(run: dict) -> dict:
    """Copy a validated code_route for export. Absent stays absent."""
    value = run.get("code_route")
    if value is None:
        return {}
    return {"code_route": validate_code_route(value)}


def from_manifest(manifest: dict) -> dict:
    """Build a Code Route from an explicit multi-project / cross-harness manifest.

    The collector may miss whole harness populations (Claude projects-only nightrun).
    A manifest records which populations were observed and which were absent without
    inventing lane attribution. Every stop keeps its measured or declared basis.
    """
    if not isinstance(manifest, dict):
        _bad("manifest must be an object.")
    version = manifest.get("version", 1)
    if version != 1:
        _bad("manifest.version must be 1.")
    route = {
        "v": SCHEMA,
        "projects": manifest.get("projects"),
        "stops": manifest.get("stops"),
        "connectors": manifest.get("connectors") or [],
        "finish": manifest.get("finish"),
        "stats": manifest.get("stats"),
    }
    if manifest.get("harnesses") is not None:
        route["harnesses"] = manifest["harnesses"]
    if manifest.get("unavailable") is not None:
        route = {"v": SCHEMA, "unavailable": manifest["unavailable"]}
        if manifest.get("harnesses") is not None:
            route["harnesses"] = manifest["harnesses"]
    return validate_code_route(route)


def compact_from_checkpoints(
    *,
    project_label: str,
    commits: int | None = None,
    files_changed: int | None = None,
    checks: int | None = None,
    artifact: bool = False,
    receipts: int | None = None,
    why_if_empty: str = "No checkpoint evidence: no commits, checks, merges or artifacts recorded.",
) -> dict:
    """Honest single-project compact route when checkpoint evidence exists."""
    label = _label(project_label, "project")
    stops = []
    if type(files_changed) is int and files_changed > 0:
        stops.append(
            {
                "id": "edit",
                "project": "p1",
                "kind": "edit",
                "label": f"{files_changed} file{'s' if files_changed != 1 else ''} changed",
                "basis": "measured",
                "evidence": [f"{files_changed} files touched in the session"],
            }
        )
    if type(commits) is int and commits > 0:
        stops.append(
            {
                "id": "commit",
                "project": "p1",
                "kind": "commit",
                "label": f"{commits} commit{'s' if commits != 1 else ''} landed",
                "basis": "measured",
                "evidence": [f"{commits} commits measured"],
            }
        )
    if type(checks) is int and checks > 0:
        stops.append(
            {
                "id": "check",
                "project": "p1",
                "kind": "check",
                "label": f"{checks} check{'s' if checks != 1 else ''} passed",
                "basis": "measured",
            }
        )
    if type(receipts) is int and receipts > 0:
        stops.append(
            {
                "id": "merge",
                "project": "p1",
                "kind": "merge",
                "label": f"{receipts} receipt{'s' if receipts != 1 else ''} linked",
                "basis": "declared",
            }
        )
    if artifact:
        stops.append(
            {
                "id": "artifact",
                "project": "p1",
                "kind": "artifact",
                "label": "Shipped artifact",
                "basis": "declared",
            }
        )
    if not stops:
        return validate_code_route({"v": SCHEMA, "unavailable": {"why": why_if_empty}})
    finish_stop = stops[-1]["id"]
    finish_kind = "artifact" if stops[-1]["kind"] == "artifact" else "unfinished"
    return validate_code_route(
        {
            "v": SCHEMA,
            "projects": [{"id": "p1", "label": label, "basis": "measured"}],
            "stops": stops,
            "connectors": [
                {
                    "from": stops[i]["id"],
                    "to": stops[i + 1]["id"],
                    "kind": "continue",
                    "label": "next",
                }
                for i in range(len(stops) - 1)
            ],
            "finish": {
                "stop": finish_stop,
                "kind": finish_kind,
                "label": stops[-1]["label"],
            },
            "stats": {
                "projects_touched": 1,
                "commits": commits if type(commits) is int and commits > 0 else 0,
                "files_changed": files_changed
                if type(files_changed) is int and files_changed > 0
                else 0,
                "verified_checkpoints": sum(1 for s in stops if s["basis"] == "measured"),
                "shipped_artifacts": 1 if artifact else 0,
            },
        }
    )


def attach_measured_code_route(run: dict) -> dict:
    """Attach a compact Code Route from measured capture counts when none was supplied.

    Does not invent projects, output links or receipts. A run that already carries
    code_route (including unavailable) is left alone. Missing project or checkpoint
    evidence stays unknown: no fabricated route.
    """
    if not isinstance(run, dict) or run.get("code_route") is not None:
        return run
    project = run.get("project")
    if not isinstance(project, str) or not project.strip():
        return run
    if run.get("project_proven") is False:
        return run
    files = run.get("files_touched")
    commits = run.get("commits")
    # artifacts_produced counts tool writes, not a declared shipped output. Never promote it
    # to an artifact finish stop.
    route = compact_from_checkpoints(
        project_label=project.strip(),
        commits=commits if type(commits) is int else None,
        files_changed=files if type(files) is int else None,
    )
    if route.get("unavailable"):
        return run
    harness = str(run.get("harness") or "").strip().lower()
    observed = []
    if "cursor" in harness:
        observed = ["cursor"]
    elif "claude" in harness:
        observed = ["claude-cli"]
    elif "codex" in harness:
        observed = ["codex"]
    elif "grok" in harness:
        observed = ["grok-bot"]
    if observed:
        route["harnesses"] = {
            "observed": observed,
            "absent": [],
            "basis": "collector",
        }
        route = validate_code_route(route)
    run["code_route"] = route
    return run
