"""Private post-session capture for Cursor.

Cursor exposes no documented local post-composer hook. STRIVE therefore checks the local
state.vscdb with a user scheduler. It reads completed composer ids and the redacted bubble clock,
stores one private draft per composer, and serves it on a loopback preview. It opens no browser
window unless it was installed or run with --open: the preview URL is written to hook.log.
"""
from __future__ import annotations

import glob
import hashlib
import http.server
import json
import os
import plistlib
import shlex
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

from . import cursor_tree

DEFAULT_ROOT = Path.home() / ".agentgrinder" / "hook"
DEFAULT_PORT = 8765
LABEL = "app.strive.cursor-hook"
CRON_MARKER = "# strive-cursor-hook"
UNIT = "strive-cursor-hook"
# Hooks installed before the rename to STRIVE carry the old product name. A live install is found
# by the path recorded in install.json, and every cron marker is swept, so an existing hook still
# reports active and still uninstalls cleanly instead of running twice beside a new one.
LEGACY_CRON_MARKERS = ("# pacecard-cursor-hook",)


def _has_marker(line: str) -> bool:
    return any(marker in line for marker in (CRON_MARKER, *LEGACY_CRON_MARKERS))


def _root(value=None) -> Path:
    root = Path(value or DEFAULT_ROOT).expanduser()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root


def _state(root: Path) -> sqlite3.Connection:
    db = sqlite3.connect(root / "state.db")
    db.execute("create table if not exists processed(composer_id text primary key, captured_at text not null default CURRENT_TIMESTAMP)")
    os.chmod(root / "state.db", 0o600)
    return db


def finished_composers(conn: sqlite3.Connection) -> list[str]:
    """Completed top-level composers, oldest first. No composer text is returned."""
    out = []
    try:
        subagents = {
            row[0] for row in conn.execute(
                "select composerId from composerHeaders where isSubagent=1")
        }
    except sqlite3.DatabaseError:
        subagents = set()
    for key, raw in conn.execute(
            "select key,value from cursorDiskKV where key like 'composerData:%'"):
        try:
            composer = json.loads(raw)
        except (TypeError, ValueError):
            continue
        if not isinstance(composer, dict) or composer.get("status") != "completed":
            continue
        composer_id = key.split(":", 1)[1]
        if composer_id in subagents:
            continue
        info = composer.get("subagentInfo")
        if isinstance(info, dict) and info.get("parentComposerId"):
            continue
        updated = composer.get("lastUpdatedAt") or composer.get("createdAt") or 0
        out.append((updated, composer_id))
    out.sort(key=lambda item: (item[0], item[1]))
    return [composer_id for _, composer_id in out]


def _transcript(composer_id: str) -> Path | None:
    pattern = str(Path.home() / ".cursor/projects/*/agent-transcripts" / composer_id / "*.jsonl")
    files = [Path(path) for path in glob.glob(pattern) if Path(path).is_file()]
    return max(files, key=lambda path: path.stat().st_mtime) if files else None


def _capture(composer_id: str, db=None) -> dict | None:
    path = _transcript(composer_id)
    if path is None:
        return None
    from .ingest import parse_cursor_session
    run = parse_cursor_session(str(path), cursor_db=db)
    # Message excerpts and path-derived region labels have no place in an automatic card.
    run.pop("private_title_prompt", None)
    run.pop("route_legend", None)
    run["composer_id"] = composer_id
    return run


def _store_private(root: Path, composer_id: str, run: dict) -> str:
    from .capture import connect
    from .identity import resolve
    # The account this machine already holds, read from local config (identity.py): no network,
    # no sign-in change. Stored with the draft so a re-render after review says the same name.
    who = resolve()
    run["athlete_handle"] = who.handle
    run["athlete"] = who.display
    db = connect(root / "capture")
    draft_id = hashlib.sha256(("cursor-composer:" + composer_id).encode()).hexdigest()
    source = "cursor-composer:" + composer_id
    try:
        with db:
            db.execute(
                """insert into drafts(id,source,harness,started,digest,payload)
                   values(?,?,?,?,?,?)
                   on conflict(id) do update set payload=excluded.payload,
                     digest=excluded.digest,updated_at=CURRENT_TIMESTAMP""",
                (draft_id, source, "cursor", run.get("started") or "unknown",
                 hashlib.sha256(json.dumps(run, sort_keys=True).encode()).hexdigest(),
                 json.dumps(run)),
            )
    finally:
        db.close()
    cards = root / "cards"
    cards.mkdir(mode=0o700, exist_ok=True)
    from .metrics import build_activity
    from .render import render_card
    card = cards / f"{composer_id}.html"
    card.write_text(render_card(build_activity(run)), encoding="utf-8")
    os.chmod(card, 0o600)
    return card.name


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ValueError):
        return False


def _ensure_server(root: Path, port: int) -> None:
    def ready() -> bool:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                return True
        except OSError:
            return False

    pid_file = root / "server.pid"
    try:
        if _pid_alive(int(pid_file.read_text().strip())) and ready():
            return
    except (OSError, ValueError):
        pass
    command = [sys.executable, "-m", "agentgrinder", "hook", "serve",
               "--directory", str(root), "--port", str(port)]
    process = subprocess.Popen(
        command, cwd=Path(__file__).resolve().parents[1],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    pid_file.write_text(str(process.pid))
    for _ in range(20):
        if ready():
            return
        if process.poll() is not None:
            break
        time.sleep(0.05)
    raise OSError(f"Could not start the private preview at 127.0.0.1:{port}.")


def _finished_everywhere(source: Path) -> list[str]:
    """Every composer the hook may capture, from BOTH of Cursor's stores, oldest first.

    Until 16 Sep 2026 this read the global store alone. Cursor 3.20.17 stopped writing new sessions
    there, so on this Mac the global store held none of the newest 100 sessions and the hook could
    not see a single thing the user did this week. The chat store answers for those. A composer in
    both is listed once.
    """
    from . import cursor_chats
    found: list[str] = []
    try:
        with cursor_tree.CopiedDb(source) as cursor_db:
            found.extend(finished_composers(cursor_db))
    except (OSError, sqlite3.DatabaseError, FileNotFoundError):
        pass                      # the old store may be absent on a fresh install; the new one is not
    try:
        found.extend(cursor_chats.finished_chat_composers())
    except (OSError, sqlite3.DatabaseError):
        pass
    return list(dict.fromkeys(found))


def run_once(directory=None, db=None, port: int = DEFAULT_PORT,
             capture_one=None, open_one=None, open_preview: bool = False) -> dict:
    root = _root(directory)
    source = Path(db).expanduser() if db else cursor_tree.db_path()
    capture_one = capture_one or (lambda composer_id: _capture(composer_id, source))
    # No surprise windows: a scheduled capture opens a browser only when the person installed
    # the hook with --open. Otherwise the preview URL goes to hook.log and the command output.
    if open_one is None and open_preview:
        open_one = lambda url: webbrowser.open(url)
    created = []
    finished = _finished_everywhere(source)
    state = _state(root)
    try:
        for composer_id in finished:
            with state:
                claimed = state.execute(
                    "insert or ignore into processed(composer_id) values(?)", (composer_id,))
            if claimed.rowcount == 0:
                continue
            try:
                run = capture_one(composer_id)
                if run is None:
                    with state:
                        state.execute("delete from processed where composer_id=?", (composer_id,))
                    continue
                card_name = _store_private(root, composer_id, run)
            except Exception:
                with state:
                    state.execute("delete from processed where composer_id=?", (composer_id,))
                raise
            created.append((composer_id, card_name))
    finally:
        state.close()
    result = {"captured": len(created), "composer_ids": [item[0] for item in created]}
    if created:
        _ensure_server(root, port)
        preview = f"http://127.0.0.1:{port}/{created[-1][1]}"
        result["preview"] = preview
        if open_one is not None:
            open_one(preview)
    return result


def _command(directory: Path, port: int, action: str = "run", db=None,
             open_preview: bool = False) -> list[str]:
    command = [sys.executable, "-m", "agentgrinder", "hook", action, "--harness", "cursor",
               "--directory", str(directory), "--port", str(port)]
    if db is not None and action in ("run", "watch"):
        command.extend(["--db", str(Path(db).expanduser())])
    if open_preview and action in ("run", "watch"):
        command.append("--open")
    return command


def _seed(root: Path, db=None) -> int:
    source = Path(db).expanduser() if db else cursor_tree.db_path()
    # Seed from BOTH stores. Seeding from the old store alone would leave every chat store session
    # unprocessed, so an install would capture hundreds of old sittings on its first tick.
    ids = _finished_everywhere(source)
    state = _state(root)
    try:
        with state:
            state.executemany("insert or ignore into processed(composer_id) values(?)",
                              ((composer_id,) for composer_id in ids))
    finally:
        state.close()
    return len(ids)


def _install_launchd(root: Path, port: int, db=None, open_preview: bool = False) -> dict:
    agents = Path.home() / "Library/LaunchAgents"
    agents.mkdir(parents=True, exist_ok=True)
    path = agents / f"{LABEL}.plist"
    payload = {
        "Label": LABEL,
        "ProgramArguments": _command(root, port, db=db, open_preview=open_preview),
        "WorkingDirectory": str(Path(__file__).resolve().parents[1]),
        "StartInterval": 30,
        "RunAtLoad": True,
        "StandardOutPath": str(root / "hook.log"),
        "StandardErrorPath": str(root / "hook.log"),
    }
    path.write_bytes(plistlib.dumps(payload))
    subprocess.run(["launchctl", "unload", str(path)], capture_output=True)
    subprocess.run(["launchctl", "load", str(path)], check=True)
    return {"mode": "launchd", "config": str(path)}


def _systemd_available() -> bool:
    if not shutil.which("systemctl"):
        return False
    return subprocess.run(
        ["systemctl", "--user", "show-environment"],
        capture_output=True, timeout=5,
    ).returncode == 0


def _install_systemd(root: Path, port: int, db=None, open_preview: bool = False) -> dict:
    folder = Path.home() / ".config/systemd/user"
    folder.mkdir(parents=True, exist_ok=True)
    service = folder / f"{UNIT}.service"
    timer = folder / f"{UNIT}.timer"
    command = " ".join(shlex.quote(part) for part in _command(root, port, db=db, open_preview=open_preview))
    service.write_text(
        "[Unit]\nDescription=STRIVE private Cursor capture\n\n"
        "[Service]\nType=oneshot\n"
        f"WorkingDirectory={Path(__file__).resolve().parents[1]}\nExecStart={command}\n")
    timer.write_text(
        "[Unit]\nDescription=Check for completed Cursor composers\n\n"
        "[Timer]\nOnBootSec=30\nOnUnitActiveSec=30\nAccuracySec=5\n\n"
        "[Install]\nWantedBy=timers.target\n")
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "--now", timer.name], check=True)
    return {"mode": "systemd-user-timer", "config": str(timer), "service": str(service)}


def _install_cron(root: Path, port: int, db=None, open_preview: bool = False) -> dict | None:
    if not shutil.which("crontab"):
        return None
    current = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    lines = [] if current.returncode else [
        line for line in current.stdout.splitlines() if not _has_marker(line)]
    command = " ".join(shlex.quote(part) for part in _command(root, port, db=db, open_preview=open_preview))
    lines.append(f"* * * * * cd {shlex.quote(str(Path(__file__).resolve().parents[1]))} && {command} {CRON_MARKER}")
    subprocess.run(["crontab", "-"], input="\n".join(lines) + "\n", text=True, check=True)
    return {"mode": "cron", "config": "user crontab"}


def _install_watcher(root: Path, port: int, db=None, open_preview: bool = False) -> dict:
    process = subprocess.Popen(
        _command(root, port, "watch", db, open_preview), cwd=Path(__file__).resolve().parents[1],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=open(root / "hook.log", "a"), start_new_session=True,
    )
    (root / "watcher.pid").write_text(str(process.pid))
    return {"mode": "polling-watcher", "config": str(root / "watcher.pid")}


def install(directory=None, db=None, port: int = DEFAULT_PORT, open_preview: bool = False) -> dict:
    root = _root(directory)
    current = status(root)
    if current.get("installed") and current.get("active"):
        return current
    seeded = _seed(root, db)
    if sys.platform == "darwin":
        record = _install_launchd(root, port, db, open_preview)
    elif _systemd_available():
        record = _install_systemd(root, port, db, open_preview)
    else:
        record = _install_watcher(root, port, db, open_preview)
    record.update({"harness": "cursor", "directory": str(root), "port": port,
                   "opens_browser": bool(open_preview),
                   "existing_composers_ignored": seeded,
                   "reason": "Cursor exposes no documented local completion hook, so STRIVE checks state.vscdb on a local timer."})
    (root / "install.json").write_text(json.dumps(record, indent=2))
    return record


def _active(record: dict, root: Path) -> bool:
    mode = record.get("mode")
    if mode == "launchd":
        return subprocess.run(
            ["launchctl", "print", f"gui/{os.getuid()}/{Path(record.get('config') or LABEL).stem or LABEL}"],
            capture_output=True,
        ).returncode == 0
    if mode == "systemd-user-timer":
        return subprocess.run(
            ["systemctl", "--user", "is-active", "--quiet", Path(record.get("config") or f"{UNIT}.timer").name],
            capture_output=True,
        ).returncode == 0
    if mode == "cron":
        current = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
        return current.returncode == 0 and any(_has_marker(line) for line in current.stdout.splitlines())
    if mode == "polling-watcher":
        try:
            return _pid_alive(int((root / "watcher.pid").read_text().strip()))
        except (OSError, ValueError):
            return False
    return False


def status(directory=None) -> dict:
    root = _root(directory)
    try:
        record = json.loads((root / "install.json").read_text())
    except (OSError, ValueError):
        return {"installed": False, "directory": str(root)}
    state = _state(root)
    try:
        captured = state.execute("select count(*) from processed").fetchone()[0]
    finally:
        state.close()
    return {**record, "installed": True, "active": _active(record, root),
            "processed_composers": captured}


def _kill_pid(path: Path) -> None:
    try:
        pid = int(path.read_text().strip())
        command = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="],
            capture_output=True, text=True,
        ).stdout
        if _pid_alive(pid) and "agentgrinder hook" in command:
            os.kill(pid, signal.SIGTERM)
    except (OSError, ValueError):
        pass
    path.unlink(missing_ok=True)


def uninstall(directory=None) -> dict:
    root = _root(directory)
    prior = status(root)
    mode = prior.get("mode")
    if mode == "launchd":
        path = Path(prior["config"])
        subprocess.run(["launchctl", "unload", str(path)], capture_output=True)
        path.unlink(missing_ok=True)
    elif mode == "systemd-user-timer":
        subprocess.run(["systemctl", "--user", "disable", "--now", Path(prior["config"]).name],
                       capture_output=True)
        Path(prior["config"]).unlink(missing_ok=True)
        Path(prior["service"]).unlink(missing_ok=True)
        subprocess.run(["systemctl", "--user", "daemon-reload"], capture_output=True)
    elif mode == "cron" and shutil.which("crontab"):
        current = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
        lines = [line for line in current.stdout.splitlines() if not _has_marker(line)]
        subprocess.run(["crontab", "-"], input="\n".join(lines) + ("\n" if lines else ""),
                       text=True, check=True)
    _kill_pid(root / "watcher.pid")
    _kill_pid(root / "server.pid")
    (root / "install.json").unlink(missing_ok=True)
    return {"installed": False, "private_captures_kept": True, "directory": str(root)}


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return


def serve(directory=None, port: int = DEFAULT_PORT) -> int:
    root = _root(directory)
    cards = root / "cards"
    cards.mkdir(mode=0o700, exist_ok=True)
    handler = lambda *args, **kwargs: _QuietHandler(*args, directory=str(cards), **kwargs)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.serve_forever()
    return 0


def watch(directory=None, db=None, port: int = DEFAULT_PORT, open_preview: bool = False) -> int:
    while True:
        try:
            run_once(directory, db, port, open_preview=open_preview)
        except (FileNotFoundError, sqlite3.DatabaseError, OSError, ValueError):
            pass
        time.sleep(30)


def apply_review(root: Path, composer_id: str, *, outcome: str | None = None,
                 receipts: list | None = None, repo_url: str | None = None,
                 shipped: list | None = None, insight: dict | None = None) -> dict:
    """Attach a selected outcome, receipt links and one selected insight to a private draft,
    then rewrite the card.

    Only explicit fields are written. Absent fields stay absent. Validation matches
    public_outcome: bad receipts raise; nothing is scraped or invented. The insight is validated
    against the receipts THIS draft ends up with, so binding is checked after the patch, not
    against whatever the draft held a moment ago.
    """
    from .capture import connect
    from .contract import OUTCOME_FIELDS, public_outcome, selected_insight
    from .metrics import build_activity
    from .render import render_card

    root = _root(root)
    db = connect(root / "capture")
    draft_id = hashlib.sha256(("cursor-composer:" + composer_id).encode()).hexdigest()
    try:
        row = db.execute("select payload from drafts where id=?", (draft_id,)).fetchone()
        if row is None:
            raise FileNotFoundError(f"No private draft for composer {composer_id}.")
        run = json.loads(row[0])
        patch = {}
        if outcome is not None:
            text = outcome.strip()
            if not 1 <= len(text) <= 120:
                raise ValueError("outcome must be 1 to 120 characters.")
            patch["shipped"] = [text]
        if shipped is not None:
            patch["shipped"] = shipped
        if receipts is not None:
            patch["receipts"] = receipts
        if repo_url is not None:
            patch["repo_url"] = repo_url
        if insight is not None:
            patch["insight"] = insight or None
        candidate = {field: run[field] for field in OUTCOME_FIELDS if field in run}
        candidate.update(patch)
        declared = {**public_outcome(candidate), **selected_insight(candidate)}
        for field in OUTCOME_FIELDS:
            if field in patch:
                if field in declared:
                    run[field] = declared[field]
                else:
                    run.pop(field, None)
        if run.get("code_route") is not None:
            from .code_route import validate_code_route
            run["code_route"] = validate_code_route(run["code_route"])
        digest = hashlib.sha256(json.dumps(run, sort_keys=True).encode()).hexdigest()
        with db:
            db.execute(
                "update drafts set payload=?, digest=?, updated_at=CURRENT_TIMESTAMP where id=?",
                (json.dumps(run), digest, draft_id),
            )
    finally:
        db.close()
    cards = root / "cards"
    cards.mkdir(mode=0o700, exist_ok=True)
    card = cards / f"{composer_id}.html"
    card.write_text(render_card(build_activity(run)), encoding="utf-8")
    os.chmod(card, 0o600)
    return {
        "composer_id": composer_id,
        "card": str(card),
        "selected_outcome": (run.get("shipped") or [None])[0],
        "selected_insight": run.get("insight"),
        "receipts": run.get("receipts") or [],
        "has_code_route": bool(run.get("code_route")),
        "preview": f"http://127.0.0.1:{DEFAULT_PORT}/{composer_id}.html",
    }



def store_run(root: Path, composer_id: str, run: dict) -> dict:
    """Write a measured run into the private draft store and render its card."""
    root = _root(root)
    card_name = _store_private(root, composer_id, run)
    return {
        "composer_id": composer_id,
        "card": str(root / "cards" / card_name),
        "has_code_route": bool(run.get("code_route")),
        "preview": f"http://127.0.0.1:{DEFAULT_PORT}/{card_name}",
    }



def add_parser(sub) -> None:
    parser = sub.add_parser("hook", help="capture completed sessions privately on this machine")
    commands = parser.add_subparsers(dest="hook_command", required=True)
    for name in ("install", "status", "uninstall", "run", "watch", "serve"):
        command = commands.add_parser(name)
        command.add_argument("--harness", choices=["cursor"], default="cursor")
        command.add_argument("--directory")
        command.add_argument("--port", type=int, default=DEFAULT_PORT)
        if name in ("install", "run", "watch"):
            command.add_argument("--db")
            command.add_argument("--open", action="store_true",
                                 help="open each new private preview in a browser "
                                      "(default: write its loopback URL to hook.log, open nothing)")
    review = commands.add_parser("review", help="select outcome and receipts on a private draft")
    review.add_argument("--composer-id", required=True)
    review.add_argument("--directory")
    review.add_argument("--outcome", help="one selected outcome line (1-120 chars)")
    review.add_argument("--receipt", action="append", default=[],
                        help="label=https://url (repeatable, max 5)")
    review.add_argument("--insight",
                        help="ONE line this run is worth remembering for (1-120 chars). "
                             "Needs --insight-receipt naming one of this run's receipts: an "
                             "insight with nothing behind it is not shown.")
    review.add_argument("--insight-receipt",
                        help="the https receipt URL the insight is bound to")
    review.add_argument("--repo-url")
    review.add_argument("--port", type=int, default=DEFAULT_PORT)


def run_cli(args) -> int:
    try:
        if args.hook_command == "install":
            output = install(args.directory, args.db, args.port, args.open)
        elif args.hook_command == "status":
            output = status(args.directory)
        elif args.hook_command == "uninstall":
            output = uninstall(args.directory)
        elif args.hook_command == "run":
            output = run_once(args.directory, args.db, args.port, open_preview=args.open)
        elif args.hook_command == "watch":
            return watch(args.directory, args.db, args.port, args.open)
        elif args.hook_command == "review":
            receipts = []
            for item in args.receipt or []:
                if "=" not in item:
                    raise ValueError("each --receipt is label=https://url")
                label, url = item.split("=", 1)
                receipts.append({"label": label.strip(), "url": url.strip()})
            insight = None
            if args.insight or args.insight_receipt:
                if not (args.insight and args.insight_receipt):
                    raise ValueError(
                        "--insight and --insight-receipt travel together: the line is shown only "
                        "when a receipt on this run backs it.")
                insight = {"text": args.insight, "receipt": args.insight_receipt}
            output = apply_review(
                args.directory, args.composer_id,
                outcome=args.outcome, receipts=receipts or None,
                insight=insight, repo_url=args.repo_url)
            if args.port:
                try:
                    _ensure_server(_root(args.directory), args.port)
                except OSError:
                    pass
        else:
            return serve(args.directory, args.port)
        print(json.dumps(output, indent=2))
        return 0
    except (FileNotFoundError, OSError, sqlite3.DatabaseError, subprocess.SubprocessError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
