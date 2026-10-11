"""Private, explicit practice choices and reviews. An attempt is never inferred as success."""
from __future__ import annotations
import uuid
from .engine import log

SCHEMA = """
CREATE TABLE IF NOT EXISTS practices (
 id TEXT PRIMARY KEY, project TEXT NOT NULL, title TEXT NOT NULL,
 expected TEXT NOT NULL, source_revision TEXT, created_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','dismissed'))
);
CREATE TABLE IF NOT EXISTS practice_attempts (
 id TEXT PRIMARY KEY, practice_id TEXT NOT NULL REFERENCES practices(id),
 revision_id TEXT NOT NULL, created_at TEXT NOT NULL,
 tried TEXT NOT NULL DEFAULT 'unknown' CHECK(tried IN ('unknown','yes','no')),
 outcome TEXT CHECK(outcome IN ('keep','change','drop','incomparable')),
 note TEXT, reviewed_at TEXT, UNIQUE(practice_id,revision_id)
);
"""


def setup(conn):
    conn.executescript(SCHEMA)
    if 'project_identity' not in {r[1] for r in conn.execute('PRAGMA table_info(practices)')}:
        conn.execute('ALTER TABLE practices ADD COLUMN project_identity TEXT')
        for row in conn.execute('SELECT id,source_revision FROM practices WHERE source_revision IS NOT NULL').fetchall():
            source = log.get_revision(conn,row['source_revision']) or {}
            conn.execute('UPDATE practices SET project_identity=? WHERE id=?',(source.get('project_identity'),row['id']))


def accept(conn, project: str, title: str, expected: str = "", source_revision: str | None = None) -> dict:
    setup(conn)
    project, title = project.strip(), title.strip()
    if not project or not title or len(title)>500 or len(expected)>2000:
        raise ValueError("A practice needs a project and a short action (up to 500 characters).")
    identity = None
    if source_revision:
        source=log.get_revision(conn, source_revision)
        if not source or source["project"]!=project:
            raise ValueError("The source measurement must belong to this project.")
        identity = source.get('project_identity')
    else:
        identity = log.resolve_project_identity(conn, project)
    row=dict(id=uuid.uuid4().hex, project=project, title=title, expected=expected,
             source_revision=source_revision, created_at=log._now(), state="active", project_identity=identity)
    conn.execute("INSERT INTO practices(id,project,title,expected,source_revision,created_at,state,project_identity) VALUES (:id,:project,:title,:expected,:source_revision,:created_at,:state,:project_identity)",row)
    conn.commit()
    return row


def list_practices(conn, project: str | None = None) -> list[dict]:
    setup(conn)
    query="SELECT * FROM practices WHERE state='active'"
    args=()
    if project is not None:query+=" AND project=?";args=(project,)
    return [dict(r) for r in conn.execute(query+" ORDER BY created_at,id",args)]


def attach_attempt(conn, practice_id: str, revision_id: str) -> dict:
    setup(conn)
    practice=conn.execute("SELECT * FROM practices WHERE id=? AND state='active'",(practice_id,)).fetchone()
    revision=log.get_revision(conn,revision_id)
    if not practice or not revision or practice["project"]!=revision["project"]:
        raise ValueError("Choose an active practice and a measured session on the same project.")
    if practice['project_identity'] != revision.get('project_identity'):
        raise ValueError('Choose a practice from this repository. Use --source to bind a new practice to its measurement.')
    conn.execute("INSERT OR IGNORE INTO practice_attempts(id,practice_id,revision_id,created_at) VALUES (?,?,?,?)",
                 (uuid.uuid4().hex,practice_id,revision_id,log._now()))
    conn.commit()
    return dict(conn.execute("SELECT * FROM practice_attempts WHERE practice_id=? AND revision_id=?",(practice_id,revision_id)).fetchone())


def review(conn, attempt_id: str, tried: str, outcome: str, note: str = "") -> dict:
    setup(conn)
    if tried not in ("yes","no","unknown") or outcome not in ("keep","change","drop","incomparable"):
        raise ValueError("Choose whether you tried it and keep, change, drop or incomparable.")
    if tried!="yes" and outcome!="incomparable":
        raise ValueError("A practice you did not try cannot receive a measured keep/change/drop verdict.")
    if len(note)>4000:raise ValueError("Keep the review under 4000 characters.")
    if not conn.execute("SELECT 1 FROM practice_attempts WHERE id=?",(attempt_id,)).fetchone():
        raise ValueError("No such practice attempt.")
    conn.execute("UPDATE practice_attempts SET tried=?,outcome=?,note=?,reviewed_at=? WHERE id=?",
                 (tried,outcome,note,log._now(),attempt_id))
    conn.commit()
    return dict(conn.execute("SELECT * FROM practice_attempts WHERE id=?",(attempt_id,)).fetchone())


def dismiss(conn, practice_id: str):
    setup(conn)
    cursor=conn.execute("UPDATE practices SET state='dismissed' WHERE id=?",(practice_id,))
    if not cursor.rowcount:raise ValueError("No such practice.")
    conn.commit()


def context(conn, project: str, project_identity: str | None = None) -> list[dict]:
    """Private card context; public exports do not include this field."""
    items=[]
    for practice in list_practices(conn,project):
        if practice.get('project_identity') != project_identity:
            continue
        attempts=[dict(r) for r in conn.execute("SELECT * FROM practice_attempts WHERE practice_id=? ORDER BY created_at DESC,id DESC LIMIT 3",(practice["id"],))]
        items.append(dict(practice,attempts=attempts))
    return items


def add_parser(subparsers):
    parser=subparsers.add_parser("practice",help="choose a practice, record an attempt and review what changed")
    parser.add_argument("--database",help="optional local series database")
    actions=parser.add_subparsers(dest="practice_action",required=True)
    accept_parser=actions.add_parser("accept",help="choose one action for your next session")
    accept_parser.add_argument("project");accept_parser.add_argument("action")
    accept_parser.add_argument("--expected",default="")
    accept_parser.add_argument("--source",help="measurement revision that prompted the advice")
    listing=actions.add_parser("list");listing.add_argument("--project")
    attempt=actions.add_parser("attempt");attempt.add_argument("practice_id");attempt.add_argument("--revision",required=True)
    review_parser=actions.add_parser("review");review_parser.add_argument("attempt_id")
    review_parser.add_argument("--tried",choices=["yes","no","unknown"],required=True)
    review_parser.add_argument("--outcome",choices=["keep","change","drop","incomparable"],required=True)
    review_parser.add_argument("--note",default="")
    dismissal=actions.add_parser("dismiss");dismissal.add_argument("practice_id")


def run_cli(args):
    import json
    conn=log.connect(args.database)
    try:
        if args.practice_action=="accept":
            output=accept(conn,args.project,args.action,args.expected,args.source)
        elif args.practice_action=="list":
            output=context(conn,args.project) if args.project else list_practices(conn)
        elif args.practice_action=="attempt":output=attach_attempt(conn,args.practice_id,args.revision)
        elif args.practice_action=="review":output=review(conn,args.attempt_id,args.tried,args.outcome,args.note)
        else:dismiss(conn,args.practice_id);output={"dismissed":args.practice_id}
        print(json.dumps(output,indent=2))
        return 0
    except ValueError as error:
        print(str(error))
        return 1
    finally:conn.close()
