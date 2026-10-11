"""Build a metrics-only import URL for the web app. No prompt text, no paths."""
from __future__ import annotations

import base64
import gzip
import json
import os
import urllib.parse
from .contract import public_code_route_fields, public_outcome, public_revision, validate_run
from .coach.experiment import public_experiment, public_text

# The hosted app, so a stranger's --push opens a page that exists. A contributor running the
# local UI sets AGENTGRINDER_URL=http://localhost:8000.
DEFAULT_URL = os.environ.get("AGENTGRINDER_URL", "https://striverun.app")
COMPRESS_AT_BYTES = 1500


def export_run(run: dict) -> dict:
    """Allowlisted fields only — must match site/index.html importRun()."""
    validate_run(run)
    rig = run.get("rig") or {}
    rhythm = run.get("rhythm") or run.get("series")
    out = {
        "harness": run.get("harness"),
        "capture_metadata": run.get("capture_metadata"),
        "is_sample": True if run.get("is_sample") is True else None,
        "activity_label": "bot activity" if run.get("harness") == "Grok Bot" else None,
        "project": run.get("project") if run.get("project_proven") is not False else None,
        "turns_typed": run.get("turns_typed"),
        "duration_s": run.get("duration_s"),
        "tool_calls": run.get("tool_calls"),
        "shell_calls": run.get("shell_calls"),
        "files_touched": run.get("files_touched"),
        "commits": run.get("commits"),
        # the five-number parts (counts only). The web app previews them; it cannot store them
        # until its runs table has the columns (site/index.html importRun).
        "claims": run.get("claims"),
        "claims_verified": run.get("claims_verified"),
        "artifacts_produced": run.get("artifacts_produced"),
        # reach: True/False/None from git (agentgrinder/reach.py). The reason is one sentence with
        # no paths, no owner names and no repository names, so it is safe to travel with the run.
        "reach": run.get("reach"),
        "reach_reason": run.get("reach_reason"),
        # the coach's verdict (agentgrinder/coach): a paragraph, a plan, and the hook's call count.
        # Counts and sentences the coach wrote from tool results; no prompt text, no paths.
        "coach_verdict": public_text(run.get("coach_verdict")),
        "coach_plan": public_text(run.get("coach_plan")),
        "coach_tool_calls": run.get("coach_tool_calls"),
        "coach_mode": run.get("coach_mode"),
        "coach_experiment": public_experiment(run.get("coach_experiment")),
        # this grind vs your previous grind on the same project (agentgrinder/engine)
        "progress_verdict": (run.get("progress") or {}).get("verdict"),
        "progress_delta": (run.get("progress") or {}).get("delta"),
        "started": run.get("started"),
        "rhythm": rhythm,
        "ridge": run.get("ridge"),
        "ridge_basis": run.get("ridge_basis"),
        "ridge_wall_seconds": run.get("ridge_wall_seconds"),
        "worker_bins": run.get("worker_bins"),
        "commit_bins": run.get("commit_bins"),
        # The store's own tool-request count, next to tool_calls above. The two use different
        # tool vocabularies and never match exactly. Carrying both keeps the disagreement
        # visible instead of letting it silently decide whether a ridge exists.
        "ridge_tool_calls": run.get("ridge_tool_calls"),
        "route": run.get("route"),
        "trace_basis": run.get("trace_basis"),
        "rig_mcps": rig.get("mcps"),
        "rig_skills": rig.get("skills"),
        "rig_share_names": rig.get("share_names"),
        "rig_mcp_names": rig.get("mcp_names") if rig.get("share_names") else None,
        "rig_notes": rig.get("notes") or rig.get("stack_notes"),
    }
    out.update(public_revision(run))
    # Declared by the uploader, never measured (migration 008). Validated, then copied as stated.
    out.update(public_outcome(run))
    # Measured/declared Code Route (migration 009). Separate from rhythm/route integers.
    out.update(public_code_route_fields(run))
    return {k: v for k, v in out.items() if v is not None}


def import_url(run: dict, base: str | None = None) -> str:
    base = (base or DEFAULT_URL).rstrip("/")
    payload = export_run(run)
    raw = json.dumps(payload, separators=(",", ":")).encode()
    if len(raw) >= COMPRESS_AT_BYTES:
        compressed = gzip.compress(raw, mtime=0)
        token = base64.urlsafe_b64encode(compressed).decode().rstrip("=")
        return f"{base}/#import=gz.{token}"
    token = urllib.parse.quote(base64.b64encode(raw).decode(), safe="")
    return f"{base}/#import={token}"
