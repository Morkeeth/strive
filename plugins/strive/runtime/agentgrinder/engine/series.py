"""One call for the CLI: record this grind and attach its progress block to the run dict."""
from __future__ import annotations

from . import log
from .reporter import progress, progress_line


def record_and_attach(run: dict, path: str | None = None, command: str = "agentgrinder grind") -> dict:
    conn = log.connect(path)
    try:
        revision = log.record_run(conn, run, command=command)
        project = run.get("project") or "session"
        pred = log.take_prediction(conn, project, run["started"],run.get('project_identity'))
        baseline = log.get_revision(conn, revision.get("baseline_revision_id"))
        comparison = ([baseline] if baseline else []) + [revision]
        p = progress(comparison, run, pred)
        p["runs_on_project"] = sum(r["started"] <= run["started"] for r in log.list_readings(conn, project, run.get("project_identity")))
        p["revision_id"] = revision["revision_id"]
        p["baseline_revision_id"] = revision.get("baseline_revision_id")
        from ..practices import context
        run["practice_context"] = context(conn, project,run.get('project_identity'))
        run["headline_metric_id"] = revision.get("metric_id")
        run["headline_label"] = revision.get("metric_label")
    finally:
        conn.close()
    run["progress"] = p
    run["measurement"] = revision
    run["progress_line"] = progress_line(p, run.get("project") or "session")
    return run
