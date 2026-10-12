"""The round trip nobody had run: save a run with a ridge, reload it in a browser, see the ridge.

What this proves. A real Chromium loads the shipped `site/index.html`, signs in as a TEST DATA
owner, opens a run that was saved through the same REST path the browser Save uses, and finds the
activity bars in the DOM. It then RELOADS the page, so the second render is served from the
database and not from anything the first render left in memory, and finds the same recorded bars again.

What this does not prove. The stack is the repository's disposable stack: PGlite plus the
PostgREST and auth shim in `scripts/disposable-supabase.mjs`, not a hosted Supabase project. It has
the same schema and the same policies, applied from `supabase/strava/*.sql`, and it is not the
hosted database. No hosted row is written by this script.

The control comes first. A run saved with NO bins must draw no ridge. If that control draws one,
the positive result means nothing, so this script fails on the control before it reports a pass.

TEST DATA actors only. No production writes, no posting, no deployment.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from subprocess import PIPE, Popen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SB_ORIGIN = "http://127.0.0.1:54321"      # the literal site/index.html is built against
BINS = 50
RIDGE = [4 if i % 7 == 0 else i % 3 for i in range(BINS)]
WORKER_BINS = [2 if 10 < i < 30 else 0 for i in range(BINS)]
COMMIT_BINS = [3, 17, 42]
WALL_SECONDS = 1234.5


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "site"), **kwargs)

    def log_message(self, fmt, *args):
        pass


def mint(sub: str, handle: str) -> str:
    header = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').decode().rstrip("=")
    claims = {"sub": sub, "email": handle + "@example.test", "role": "authenticated",
              "aud": "authenticated", "exp": 2_000_000_000}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return header + "." + payload + ".sig"


def session(sub: str, handle: str) -> dict:
    token = mint(sub, handle)
    return {"access_token": token, "refresh_token": token, "token_type": "bearer",
            "expires_in": 86400, "expires_at": 2_000_000_000,
            "user": {"id": sub, "aud": "authenticated", "role": "authenticated",
                     "email": handle + "@example.test",
                     "user_metadata": {"user_name": handle, "full_name": handle},
                     "app_metadata": {"provider": "email"}}}


def session_script(value: dict) -> str:
    blob = json.dumps(json.dumps(value))
    return ("localStorage.setItem('agentic-strava-auth'," + blob + ");"
            "localStorage.setItem('ag_onboard_done','1');")


def save_run(disposable: str, sub: str, handle: str, row: dict) -> str:
    # Synthetic fixture only: exercise the same private insert then owner-share path as the app.
    payload = dict(row)
    audience = payload.get("visibility", "private")
    payload.setdefault("measurement_revision", hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest())
    payload["visibility"] = "private"
    request = urllib.request.Request(
        disposable + "/rest/v1/runs?select=id",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={"apikey": "local-development-only", "Content-Profile": "strava",
                 "Content-Type": "application/json",
                 "Authorization": "Bearer " + mint(sub, handle)})
    with urllib.request.urlopen(request, timeout=30) as response:
        run_id = json.loads(response.read().decode())[0]["id"]
    if audience != "private":
        share = urllib.request.Request(
            disposable + "/rest/v1/runs?id=eq." + run_id,
            data=json.dumps({"visibility": audience}).encode(), method="PATCH",
            headers={"apikey": "local-development-only", "Content-Profile": "strava",
                     "Content-Type": "application/json",
                     "Authorization": "Bearer " + mint(sub, handle)})
        with urllib.request.urlopen(share, timeout=30) as response:
            response.read()
    return run_id


def proxy(route, disposable):
    request = route.request
    if not request.url.startswith(SB_ORIGIN):
        return route.abort()
    target = request.url.replace(SB_ORIGIN, disposable)
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    data = request.post_data.encode() if request.post_data is not None else None
    outgoing = urllib.request.Request(target, data=data, method=request.method, headers=headers)
    try:
        with urllib.request.urlopen(outgoing, timeout=30) as response:
            body = response.read()
            kept = {k: v for k, v in response.headers.items()
                    if k.lower() not in ("transfer-encoding", "content-encoding", "content-length")}
            route.fulfill(status=response.status, headers=kept, body=body)
    except urllib.error.HTTPError as exc:
        route.fulfill(status=exc.code, headers={"content-type": "application/json"},
                      body=exc.read())


def ridge_state(page) -> dict:
    return page.evaluate("""() => {const s=document.querySelector('.post-trail svg');
      return s ? {present:true,bars:[...s.querySelectorAll('.activity-bar')].map(n=>({height:n.getAttribute('height'),title:n.textContent})),
      ticks:s.querySelectorAll('.activity-commit').length,label:s.getAttribute('aria-label')} : {present:false};}""")


def main() -> int:
    env = os.environ.copy()
    env["GRINDER_DISPOSABLE_TEST"] = "1"
    proc = Popen(["node", str(ROOT / "scripts/disposable-supabase.mjs"), "--serve"],
                 cwd=str(ROOT), env=env, stdout=PIPE, stderr=PIPE, text=True)
    line = proc.stdout.readline()
    try:
        info = json.loads(line)
    except ValueError:
        err = proc.stderr.read() if proc.stderr else ""
        proc.kill()
        print("disposable stack failed to start: " + str(line) + "\n" + err)
        return 2
    disposable = info["url"]
    casey = info["casey"]
    print("disposable stack:", disposable)

    site = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=site.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d" % site.server_address[1]

    common = {"profile_id": casey, "project": "TEST DATA project", "harness": "Codex",
              "visibility": "public", "prompts": 12, "commits": 3, "tool_calls": 226,
              "wall_time_s": 1234, "rhythm": [1, 2, 1], "schema_version": 1,
              "trace_basis": "elapsed"}
    # Owner reload uses a private run: its owner URL stays in this disposable SPA.
    # Public runs navigate to the hosted canonical page; three-reader checks cover public access.
    with_ridge = save_run(disposable, casey, "casey", dict(
        common, visibility="private", title="TEST DATA ridge survives a reload",
        caption="TEST DATA caption", ridge=RIDGE, worker_bins=WORKER_BINS,
        commit_bins=COMMIT_BINS, ridge_basis="wall-time",
        ridge_wall_seconds=WALL_SECONDS, ridge_tool_calls=255))
    without_ridge = save_run(disposable, casey, "casey", dict(
        common, title="TEST DATA control run with no bins",
        caption="TEST DATA control caption"))
    print("saved run with a ridge:", with_ridge)
    print("saved control run without bins:", without_ridge)

    failures: list[str] = []
    results: list[tuple[str, str, dict]] = []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch(headless=True, args=["--no-sandbox"])
            context = browser.new_context(viewport={"width": 1100, "height": 900})
            context.route(SB_ORIGIN + "/**", lambda route: proxy(route, disposable))
            context.add_init_script(session_script(session(casey, "casey")))
            page = context.new_page()
            page.on("pageerror", lambda exc: failures.append("page error: " + str(exc)))

            # CONTROL FIRST. A run with no bins must draw no ridge.
            page.goto(base + "/?run=" + without_ridge, wait_until="networkidle")
            control = ridge_state(page)
            results.append(("control, no bins", "first load", control))
            if control["present"]:
                failures.append("the control run drew a ridge, so the positive result proves nothing")

            page.goto(base + "/?run=" + with_ridge, wait_until="networkidle")
            page.locator(".post-trail .activity-bar").first.wait_for(state="visible")
            first = ridge_state(page)
            results.append(("ridge run", "first load", first))
            if not first["present"]:
                failures.append("the ridge did not render on the first load")

            page.reload(wait_until="networkidle")
            page.locator(".post-trail .activity-bar").first.wait_for(state="visible")
            second = ridge_state(page)
            results.append(("ridge run", "after reload", second))
            if not second["present"]:
                failures.append("the ridge did not survive the reload")
            elif second != first:
                failures.append("the ridge changed across the reload: %r then %r" % (first, second))
            elif len(second["bars"]) != sum(bool(n) or i in COMMIT_BINS for i,n in enumerate(RIDGE)):
                failures.append("recorded time windows lost across reload")
            elif second["ticks"] != len(COMMIT_BINS):
                failures.append("commit ticks lost across the reload")
            elif second["label"] != "Tool calls / min; idle gaps compressed":
                failures.append("the reloaded ridge fell back from wall time: " + str(second["label"]))

            out = Path(os.environ.get("RIDGE_RELOAD_RECEIPTS")
                       or tempfile.mkdtemp(prefix="ridge-reload-"))
            out.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(out / "ridge-after-reload.png"), full_page=False)
            print("screenshot:", out / "ridge-after-reload.png")
            browser.close()
    finally:
        site.shutdown()
        proc.kill()

    for label, when, state in results:
        print("%-18s %-12s %s" % (label, when, json.dumps(state, sort_keys=True)))
    if failures:
        for failure in failures:
            print("FAIL:", failure)
        return 1
    print("PASS: the ridge was drawn, reloaded from the database, and drawn again unchanged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
