"""Automatic fetch: new agent sessions become private STRIVE drafts, with no file picking.

Oscar, 25 Sep 2026: "the uploads is awful ... automatic fetch". Connect once in the browser (it
issues a private upload token), run `agentgrinder sync --install --token <token>` once, and from
then on every finished Claude Code, Cursor and Codex session on this computer is uploaded as a
private run. Only the counts leave the machine: the payload is agent_api.run_payload, the same
allowlist as `agentgrinder agent draft`, with no title, no prompt text and no paths. Nothing is
public until the person publishes it on the site.

A session is "finished" when its file has not changed for IDLE_SECONDS and is still the same
size and mtime at the next sync. The first sync that sees an idle file only records it; a later
sync sends it if nothing moved. Each session file is sent once: its identity is the harness and
the file, not its size, so a session resumed after it was sent is not sent again. The
Idempotency-Key is derived from that identity, so a retry returns the existing run instead of
a duplicate. A send counts only when the server answers with a run id and visibility private.
"""
from __future__ import annotations

import glob
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from . import ingest

DEFAULT_SITE = os.environ.get("STRIVE_URL", "https://striverun.app")
STATE_DIR = Path(os.environ.get("STRIVE_HOME", str(Path.home() / ".strive")))
IDLE_SECONDS = 10 * 60
SITTING_GAP = 30 * 60   # a run ends after 30 idle minutes, the same split as the card and the CLI
SINCE_DAYS = 7
INTERVAL = 15 * 60
MAX_PER_SYNC = 20   # the database rate-limits uploads; the rest go on the next sync
LABEL = "app.strive.sync"
NAMESPACE = uuid.UUID("7d3f0a52-6d3c-4b7e-9a4f-2f0c6a1e5b11")
UVX_SOURCE = "git+https://github.com/Morkeeth/strive"
# The upload token only ever goes to these hosts, over HTTPS, with redirects refused.
TRUSTED_HOSTS = {"striverun.app", "agentic-strava.vercel.app"} | {
    h.strip().lower() for h in os.environ.get("STRIVE_TRUSTED_HOSTS", "").split(",") if h.strip()}


def _paths():
    return {"token": STATE_DIR / "token", "state": STATE_DIR / "synced.json", "log": STATE_DIR / "sync.log"}


def discover(now: float | None = None, since_days: int = SINCE_DAYS, idle: int = IDLE_SECONDS) -> list[tuple[str, str]]:
    """(harness, path) for every finished session changed in the last since_days, oldest first."""
    now = time.time() if now is None else now
    found: dict[str, tuple[str, float]] = {}
    sources = [("claude", glob.glob(os.path.expanduser(ingest.CLAUDE_GLOB))),
               ("cursor", glob.glob(os.path.expanduser(ingest.CURSOR_GLOB))),
               ("codex", ingest.codex_session_files())]
    for harness, files in sources:
        for path in files:
            try:
                mtime = os.path.getmtime(path)
            except OSError:
                continue
            if now - mtime < idle or now - mtime > since_days * 86400:
                continue
            found.setdefault(path, (harness, mtime))
    return [(h, p) for p, (h, _) in sorted(found.items(), key=lambda kv: kv[1][1])]


def file_key(harness: str, path: str) -> str:
    """The session's identity. Size and mtime are left out on purpose: a resumed session is the same session."""
    os.stat(path)
    return f"{harness}|{os.path.realpath(path)}"


def snapshot(path: str) -> list[int]:
    st = os.stat(path)
    return [st.st_size, st.st_mtime_ns]


def idempotency_key(key: str) -> str:
    return str(uuid.uuid5(NAMESPACE, key))


def sitting_count(harness: str, path: str) -> int:
    """How many sittings a person sat through in this file, oldest first. Raises ValueError for none.

    The same 30-minute split as the CLI and the card (native_sittings, solo). Appending to a file
    only extends its last sitting or adds a new one, so a sitting's position is a stable identity.
    """
    if harness == "claude":
        from .solo import human_sittings
        count = len(human_sittings(path, SITTING_GAP))
    else:
        from .native_sittings import sittings
        count = len(sittings(path, harness, SITTING_GAP))
    if not count:
        raise ValueError("no sitting with a typed turn")
    return count


def sitting_key(key: str, index: int) -> str:
    return f"{key}|{index}"


def payload_for(harness: str, path: str, pick: int = -1) -> dict:
    from .agent_api import run_payload
    from .native_sittings import read_sitting
    run = read_sitting(path, harness, pick=pick, gap=SITTING_GAP)
    run.pop("title", None)
    return run_payload(run, "private")


def read_token(explicit: str | None = None) -> str | None:
    if explicit:
        return explicit.strip()
    env = os.environ.get("STRIVE_AGENT_TOKEN")
    if env:
        return env.strip()
    try:
        return _paths()["token"].read_text().strip() or None
    except OSError:
        return None


def save_token(token: str) -> Path:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(STATE_DIR, 0o700)
    path = _paths()["token"]
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(token.strip() + "\n")
    os.chmod(path, 0o600)
    return path


def load_state() -> dict:
    try:
        data = json.loads(_paths()["state"].read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _paths()["state"].with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1, sort_keys=True))
    tmp.replace(_paths()["state"])


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None   # a redirect would carry the Bearer token somewhere else; stop instead


_OPENER = urllib.request.build_opener(_NoRedirect).open


def check_site(site: str) -> str:
    parts = urllib.parse.urlsplit(site)
    if parts.scheme != "https" or (parts.hostname or "").lower() not in TRUSTED_HOSTS:
        raise ValueError(f"Refusing to send the token to {site!r}: use https://{sorted(TRUSTED_HOSTS)[0]}")
    return f"https://{parts.netloc}"


# Local words for each failure. The server's own text is never printed or logged.
def _failure(code: int) -> str:
    if code in (401, 403):
        return f"HTTP {code}: the token is expired or revoked. Make a new one on the Connect page."
    if code == 429:
        return "HTTP 429: too many uploads. The next sync retries."
    if 300 <= code < 400:
        return f"HTTP {code}: STRIVE answered with a redirect. Nothing was sent."
    if code >= 500:
        return f"HTTP {code}: STRIVE had an error. The next sync retries."
    return f"HTTP {code}: STRIVE refused this run."


def upload(payload: dict, token: str, key: str, site: str = DEFAULT_SITE, opener=None) -> dict:
    opener = opener or _OPENER
    try:
        site = check_site(site)
    except ValueError as error:
        raise RuntimeError(str(error)) from None
    body = json.dumps(payload).encode()
    request = urllib.request.Request(site.rstrip("/") + "/api/agent/runs", data=body, method="POST", headers={
        "Content-Type": "application/json", "Authorization": "Bearer " + token, "Idempotency-Key": key})
    try:
        with opener(request, timeout=30) as response:
            if getattr(response, "status", 200) != 200:
                raise RuntimeError(_failure(response.status))
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(_failure(error.code)) from None
    except urllib.error.URLError:
        raise RuntimeError("STRIVE is unreachable. The next sync retries.") from None
    except ValueError:
        raise RuntimeError("STRIVE sent an answer that is not a run. Nothing is marked sent.") from None
    # Only a confirmed private run counts as sent.
    if not isinstance(result, dict) or not isinstance(result.get("id"), str) or not result["id"] \
            or result.get("visibility") != "private":
        raise RuntimeError("STRIVE did not confirm a private run. Nothing is marked sent.")
    return result


def sync_once(token: str, site: str = DEFAULT_SITE, dry_run: bool = False, since_days: int = SINCE_DAYS,
              now: float | None = None, opener=None, out=print) -> dict:
    state = load_state()
    counts = {"sent": 0, "skipped": 0, "failed": 0, "already": 0, "waiting": 0}
    for harness, path in discover(now=now, since_days=since_days):
        if counts["sent"] >= MAX_PER_SYNC:
            break
        try:
            key = file_key(harness, path)
            snap = snapshot(path)
        except OSError:
            continue
        digest = hashlib.sha256(key.encode()).hexdigest()   # the state file holds no paths
        seen = state.get(digest) or {}
        if not dry_run and seen.get("snapshot") != snap:
            # First sight, or it moved since the last sync: wait one more sync before sending.
            state[digest] = {"status": "waiting", "snapshot": snap, "at": int(time.time())}
            counts["waiting"] += 1
            continue
        if seen.get("status") == "skipped":
            counts["already"] += 1
            continue
        try:
            total = sitting_count(harness, path)
        except (ValueError, KeyError, TypeError, OSError):
            # No typed turn or an unreadable file: not a run. Looked at again only if the file changes.
            state[digest] = {"status": "skipped", "snapshot": snap, "at": int(time.time())}
            counts["skipped"] += 1
            continue
        # A long-lived session file holds many sittings. Each one is its own private run, sent once.
        # Earlier sittings are closed. The last stays open until the split gap has passed.
        open_last = (time.time() if now is None else now) - snap[1] / 1e9 < SITTING_GAP
        stop = False
        for index in range(1, total + 1):
            if counts["sent"] >= MAX_PER_SYNC:
                break
            skey = sitting_key(key, index)
            sdigest = hashlib.sha256(skey.encode()).hexdigest()
            if (state.get(sdigest) or {}).get("status") in ("sent", "skipped"):
                counts["already"] += 1
                continue
            if index == total and open_last:
                counts["waiting"] += 1
                continue
            try:
                payload = payload_for(harness, path, pick=index)
            except (ValueError, KeyError, TypeError, OSError):
                state[sdigest] = {"status": "skipped", "at": int(time.time())}
                counts["skipped"] += 1
                continue
            if dry_run:
                out(f"  would send a private {payload.get('harness') or harness} run: "
                    f"{payload.get('tool_calls') or 0} tool calls, {payload.get('turns_typed') or 0} turns")
                counts["sent"] += 1
                continue
            try:
                result = upload(payload, token, idempotency_key(skey), site, opener)
            except RuntimeError as error:
                out(f"  not sent ({harness}): {error}")
                counts["failed"] += 1
                if "HTTP 401" in str(error) or "HTTP 403" in str(error) or "Refusing" in str(error):
                    stop = True   # a revoked token or an untrusted site fails every file; stop and say so once
                    break
                continue
            state[sdigest] = {"status": "sent", "id": result.get("id"), "at": int(time.time())}
            counts["sent"] += 1
        if stop:
            break
    if not dry_run:
        save_state(state)
    return counts


def _command() -> list[str]:
    uvx = shutil.which("uvx")
    if uvx:
        return [uvx, "--from", UVX_SOURCE, "agentgrinder", "sync"]
    return [sys.executable, "-m", "agentgrinder", "sync"]


def install(interval: int = INTERVAL) -> str:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    log = str(_paths()["log"])
    if sys.platform == "darwin":
        import plistlib
        agents = Path.home() / "Library" / "LaunchAgents"
        agents.mkdir(parents=True, exist_ok=True)
        plist = agents / f"{LABEL}.plist"
        plist.write_bytes(plistlib.dumps({"Label": LABEL, "ProgramArguments": _command(), "StartInterval": interval,
                                          "RunAtLoad": True, "StandardOutPath": log, "StandardErrorPath": log}))
        subprocess.run(["launchctl", "unload", str(plist)], capture_output=True)
        subprocess.run(["launchctl", "load", str(plist)], check=True)
        return f"Installed: every {interval // 60} minutes (launchd {LABEL}). Log: {log}"
    marker = "# strive-sync"
    line = f"*/{max(1, interval // 60)} * * * * {' '.join(_command())} >> {log} 2>&1 {marker}"
    current = subprocess.run(["crontab", "-l"], capture_output=True, text=True).stdout
    kept = [row for row in current.splitlines() if marker not in row]
    subprocess.run(["crontab", "-"], input="\n".join(kept + [line]) + "\n", text=True, check=True)
    return f"Installed: every {interval // 60} minutes (cron). Log: {log}"


def uninstall() -> str:
    if sys.platform == "darwin":
        plist = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
        if plist.exists():
            subprocess.run(["launchctl", "unload", str(plist)], capture_output=True)
            plist.unlink()
    else:
        current = subprocess.run(["crontab", "-l"], capture_output=True, text=True).stdout
        kept = [row for row in current.splitlines() if "# strive-sync" not in row]
        subprocess.run(["crontab", "-"], input="\n".join(kept) + "\n", text=True, check=False)
    return "Automatic sync is off. The token file stays in ~/.strive until you delete it."


def add_parser(sub) -> None:
    p = sub.add_parser("sync", help="upload new agent sessions automatically as private STRIVE runs")
    p.add_argument("--token", help="the private upload token from the Connect page (saved to ~/.strive/token)")
    p.add_argument("--install", action="store_true", help="run sync every 15 minutes in the background")
    p.add_argument("--uninstall", action="store_true", help="stop automatic sync")
    p.add_argument("--dry-run", action="store_true", help="show what would be sent; send nothing")
    p.add_argument("--since-days", type=int, default=SINCE_DAYS, help="look back this many days (default 7)")
    p.add_argument("--site", default=DEFAULT_SITE, help=argparse_help_site())


def argparse_help_site() -> str:
    return "STRIVE address (default https://striverun.app)"


def run_cli(args) -> int:
    if args.uninstall:
        print(uninstall())
        return 0
    if args.dry_run and args.install:
        print("--dry-run sends nothing, so it cannot install a background uploader. Run --install without --dry-run.")
        return 1
    try:
        check_site(args.site)
    except ValueError as error:
        print(error)
        return 1
    token = read_token(args.token)
    if args.token:
        print(f"Token saved to {save_token(args.token)} (only you can read it).")
    if not token and not args.dry_run:
        print("No token yet. Sign in on STRIVE, open Connect, press Turn on automatic sync, and run the line it shows.")
        return 1
    counts = sync_once(token or "", site=args.site, dry_run=args.dry_run, since_days=args.since_days)
    verb = "would send" if args.dry_run else "sent"
    print(f"STRIVE sync: {verb} {counts['sent']} private run(s), {counts['already']} already sent, "
          f"{counts['waiting']} waiting for the next sync, {counts['skipped']} skipped, {counts['failed']} not sent. "
          "Private until you publish them.")
    if args.install:
        print(install())
    return 0 if not counts["failed"] else 2
