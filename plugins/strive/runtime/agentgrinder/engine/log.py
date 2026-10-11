"""The local series record: one reading per grind, one prediction per upcoming grind.

Named `log` and `record`, never anything else. A reading carries the five numbers the coach
owns (typed turns, claims, verified claims, artifacts produced, commits) and the headline they
make, verified per turn. `value` is NULL when the headline could not be computed; an unmeasured
run is a row that says so, not a zero.
"""
from __future__ import annotations

import os
import hashlib
import json
import sqlite3
from datetime import datetime, timezone

from ..claims import EVIDENCE_VERSION, rule_fingerprint


DEFAULT_PATH = os.path.expanduser("~/.agentgrinder/series.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS reading_origins (
 project_identity TEXT NOT NULL, started TEXT NOT NULL, revision_id TEXT NOT NULL,
 value REAL, PRIMARY KEY(project_identity,started)
);

CREATE TABLE IF NOT EXISTS measurement_revisions (
    revision_id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    started TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    baseline_revision_id TEXT,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    started TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    turns_typed INTEGER,
    claims INTEGER,
    claims_verified INTEGER,
    artifacts_produced INTEGER,
    commits INTEGER,
    value REAL,
    command TEXT NOT NULL,
    UNIQUE(project, started)
);
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    text TEXT NOT NULL,
    made_at TEXT NOT NULL,
    consumed_by TEXT
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: str | None = None) -> sqlite3.Connection:
    path = path or os.environ.get("AGENTGRINDER_SERIES") or DEFAULT_PATH
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    if 'project_identity' not in {r[1] for r in conn.execute('PRAGMA table_info(predictions)')}:
        conn.execute('ALTER TABLE predictions ADD COLUMN project_identity TEXT')
    if "revision_id" not in {r[1] for r in conn.execute("PRAGMA table_info(readings)")}:
        conn.execute("ALTER TABLE readings ADD COLUMN revision_id TEXT")
    # Existing installations retain the exact measurement they previously stored. We cannot
    # reconstruct overwritten history, so migrated records explicitly name their legacy rule.
    for old in conn.execute("SELECT * FROM readings WHERE revision_id IS NULL ORDER BY started").fetchall():
        row = dict(old)
        row.update(rule_version="legacy", parser_version="legacy", input_digest=None)
        revision = _save_revision(conn, row)
        conn.execute("UPDATE readings SET revision_id = ? WHERE id = ?", (revision["revision_id"], row["id"]))
    conn.commit()
    return conn


def record_run(conn: sqlite3.Connection, run: dict, command: str = "agentgrinder grind") -> dict:
    """Retain the first reading as a baseline; changed inputs create immutable revisions."""
    project = run.get("project") or "session"
    started = run.get("started")
    if not started:
        raise ValueError("a reading needs the sitting's start time")
    from ..metrics import headline_of
    hl = headline_of(run)
    value = hl.value
    row = dict(project=project, started=started, recorded_at=_now(),
               turns_typed=run.get("turns_typed"), claims=run.get("claims"),
               claims_verified=run.get("claims_verified"), artifacts_produced=run.get("artifacts_produced"),
               commits=run.get("commits"), value=value, command=command,
               rule_version=run.get("rule_version", rule_fingerprint() + ":" + EVIDENCE_VERSION),
               parser_version=run.get("parser_version", "0.1.0"),
               input_digest=run.get("input_digest"), project_identity=run.get("project_identity"),
               capabilities=run.get("capabilities"),
               metric_id=hl.metric_id, metric_label=hl.label)
    revision = _save_revision(conn, row)
    conn.execute("INSERT OR IGNORE INTO readings (project, started, recorded_at, turns_typed, claims, claims_verified, "
                 "artifacts_produced, commits, value, command, revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                 (project, started, row["recorded_at"], row["turns_typed"], row["claims"],
                  row["claims_verified"], row["artifacts_produced"], row["commits"], value, command,
                  revision["revision_id"]))
    if row["project_identity"]:
        conn.execute("INSERT OR IGNORE INTO reading_origins VALUES (?,?,?,?)",
                     (row["project_identity"],started,revision["revision_id"],value))
    conn.commit()
    return revision


def _save_revision(conn: sqlite3.Connection, row: dict) -> dict:
    identity = {k: v for k, v in row.items() if k not in ("id", "revision_id", "recorded_at", "command")}
    revision_id = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    existing = get_revision(conn, revision_id)
    if existing:
        return existing
    if row.get("project_identity"):
        previous = conn.execute("SELECT revision_id FROM reading_origins WHERE project_identity=? AND started<? AND value IS NOT NULL ORDER BY started DESC LIMIT 1",
                                (row["project_identity"],row["started"])).fetchone()
    else:
        candidates = conn.execute("SELECT revision_id FROM readings WHERE project = ? AND started < ? "
                                  "AND value IS NOT NULL ORDER BY started DESC",
                                  (row["project"], row["started"])).fetchall()
        previous = next((candidate for candidate in candidates
                         if not (get_revision(conn,candidate[0]) or {}).get("project_identity")),None)
    payload = {k: v for k, v in row.items() if k not in ("id", "revision_id")}
    payload.update(revision_id=revision_id, baseline_revision_id=previous[0] if previous else None)
    conn.execute("INSERT OR IGNORE INTO measurement_revisions VALUES (?,?,?,?,?,?)",
                 (revision_id, row["project"], row["started"], row["recorded_at"],
                  payload["baseline_revision_id"], json.dumps(payload, sort_keys=True)))
    return get_revision(conn, revision_id)


def get_revision(conn: sqlite3.Connection, revision_id: str | None) -> dict | None:
    row = conn.execute("SELECT payload FROM measurement_revisions WHERE revision_id = ?", (revision_id,)).fetchone()
    return json.loads(row[0]) if row else None


def list_revisions(conn: sqlite3.Connection, project: str, started: str) -> list[dict]:
    return [json.loads(r[0]) for r in conn.execute(
        "SELECT payload FROM measurement_revisions WHERE project = ? AND started = ? ORDER BY rowid",
        (project, started))]


def list_readings(conn: sqlite3.Connection, project: str, project_identity: str | None = None) -> list[dict]:
    """Every reading on one project, oldest sitting first (by when the sitting started)."""
    if project_identity:
        return [get_revision(conn,r[0]) for r in conn.execute("SELECT revision_id FROM reading_origins WHERE project_identity=? ORDER BY started",(project_identity,))]
    rows = conn.execute("SELECT * FROM readings WHERE project = ? ORDER BY started", (project,)).fetchall()
    return [dict(r) for r in rows]


def resolve_project_identity(conn, project):
    identities = {json.loads(r[0]).get('project_identity') for r in conn.execute('SELECT payload FROM measurement_revisions WHERE project=?',(project,))}
    identities.discard(None)
    if len(identities)>1:
        raise ValueError('More than one repository has this name. Select a source measurement or run predict from the intended repository without --project.')
    return next(iter(identities),None)


def predict(conn: sqlite3.Connection, project: str, text: str, project_identity: str | None = None) -> dict:
    """Write down what you expect the next grind on this project to do, before it happens."""
    text = (text or "").strip()
    if not text:
        raise ValueError("a prediction needs words")
    made = _now()
    project_identity = project_identity or resolve_project_identity(conn, project)
    cur = conn.execute("INSERT INTO predictions (project, text, made_at,project_identity) VALUES (?,?,?,?)", (project, text, made,project_identity))
    conn.commit()
    return dict(id=cur.lastrowid, project=project, text=text, made_at=made)


def take_prediction(conn: sqlite3.Connection, project: str, started: str, project_identity: str | None = None) -> dict | None:
    """The newest unconsumed prediction on this project, made before the sitting started,
    marked as consumed by it. None when there is nothing pending."""
    row = conn.execute("SELECT * FROM predictions WHERE project = ? AND project_identity IS ? AND (consumed_by IS NULL OR consumed_by = ?) "
                       "AND made_at <= ? ORDER BY made_at DESC LIMIT 1", (project, project_identity, started, started)).fetchone()
    if row is None:
        return None
    conn.execute("UPDATE predictions SET consumed_by = ? WHERE id = ?", (started, row["id"]))
    conn.commit()
    return dict(row) | {"consumed_by": started}
