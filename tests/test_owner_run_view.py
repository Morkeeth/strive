"""The owner opens a private run, sees the audience selector, and can save it as Public.

On 2026-09-25 the owner view of a private run stayed on the grey skeleton after a reload. The
cause was the fetch hook in site/index.html: on /?run= it called auth.getSession() from inside the
fetch the auth client uses for its own token refresh. With an expired access token the refresh
holds the auth lock, the hook waited on that same lock, and nothing ever left the page.

This drives a real Chromium against the shipped site/ with every Supabase request answered by a
mock in this file, so no hosted row is read or written. The rows are the field-for-field shape of
the runs that hung (tests/fixtures/owner_private_runs.json), including the null route, code_route,
project and caption. Each run is opened with an EXPIRED session (the case that hung) and a fresh
one (the control), and anonymously (the stranger must see only the private notice).
"""
from __future__ import annotations

import base64
import json
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

sync_api = pytest.importorskip("playwright.sync_api")

ROOT = Path(__file__).resolve().parents[1]
RUNS = json.loads((ROOT / "tests/fixtures/owner_private_runs.json").read_text())["runs"]
SB = "http://127.0.0.1:54321"  # the literal site/index.html is built against
UID = "0d000000-0000-4000-8000-00000000000d"
ALLOWED_HOSTS = ("127.0.0.1", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "site"), **kwargs)

    def log_message(self, fmt, *args):
        pass


@pytest.fixture(scope="module")
def site():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture(scope="module")
def browser():
    with sync_api.sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _b64(obj) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def _jwt(exp: int) -> str:
    return _b64({"alg": "HS256", "typ": "JWT"}) + "." + _b64(
        {"sub": UID, "role": "authenticated", "aud": "authenticated", "exp": exp}) + ".sig"


USER = {"id": UID, "aud": "authenticated", "role": "authenticated", "email": "owner@example.test",
        "app_metadata": {"provider": "github"}, "user_metadata": {"user_name": "test-owner"},
        "identities": []}


def _session(exp: int) -> dict:
    return {"access_token": _jwt(exp), "refresh_token": "refresh", "token_type": "bearer",
            "expires_in": 3600, "expires_at": exp, "user": USER}


def _open(browser, site, run, session):
    """Open /?run=<id> with every Supabase call mocked. Returns (page, requests, patches)."""
    page = browser.new_page()
    requests, patches, errors = [], [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    profile = {"id": run["profile_id"], "auth_uid": UID, "handle": "test-owner",
               "display_name": "Test Owner", "name": "Test Owner"}
    signed_in = session is not None

    def supabase(route, request=None):
        req = route.request
        url = req.url
        requests.append((req.method, url, dict(req.headers)))
        if "/auth/v1/token" in url:
            fresh = _session(int(time.time()) + 3600)
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(fresh))
        if "/auth/v1/user" in url:
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(USER))
        if "/rest/v1/rpc/my_profile" in url:
            # Deployed pre-042 behaviour: owner reads through the existing profile fallback.
            return route.fulfill(status=404, content_type="application/json",
                                 body=json.dumps({"code": "PGRST202", "message": "my_profile not found"}))
        if "/rest/v1/profiles" in url and "auth_uid=eq." in url:
            single = "vnd.pgrst.object" in (req.headers.get("accept") or "")
            return route.fulfill(status=200, content_type="application/json",
                                 body=json.dumps(profile if single else [profile]))
        if "/rest/v1/runs" in url and "id=eq." + run["id"] in url and req.method == "PATCH":
            patches.append(json.loads(req.post_data or "{}"))
            return route.fulfill(status=204, body="")
        if "/rest/v1/runs" in url and "id=eq." + run["id"] in url and req.method == "GET":
            if not signed_in:  # RLS: a stranger gets no row
                return route.fulfill(status=406, content_type="application/json",
                                     body=json.dumps({"code": "PGRST116", "message": "0 rows"}))
            return route.fulfill(status=200, content_type="application/vnd.pgrst.object+json",
                                 body=json.dumps(run))
        return route.fulfill(status=200, content_type="application/json",
                             headers={"content-range": "*/0"}, body="[]")

    page.route(SB + "/**", supabase)
    if session is not None:
        page.add_init_script("localStorage.setItem('agentic-strava-auth'," + json.dumps(json.dumps(session))
                             + ");localStorage.setItem('ag_onboard_done','1');")
    page.goto(f"{site}/?run={run['id']}", wait_until="domcontentloaded")
    return page, requests, patches, errors


def _no_escape(requests):
    for _, url, _ in requests:
        host = url.split("/")[2].split(":")[0]
        assert host in ALLOWED_HOSTS, url


@pytest.mark.parametrize("expired", [True, False], ids=["expired-session", "fresh-session"])
@pytest.mark.parametrize("run", RUNS, ids=[r["harness"] for r in RUNS])
def test_owner_sees_audience_selector_and_can_save_public(browser, site, run, expired):
    now = int(time.time())
    page, requests, patches, errors = _open(browser, site, run, _session(now - 600 if expired else now + 3600))
    try:
        page.get_by_role("link", name="Edit run", exact=True).wait_for(timeout=15000)
        assert "Choose who can see this" in page.inner_text("#app")
        page.get_by_role("link", name="Edit run", exact=True).click()
        page.wait_for_selector("#run-audience", timeout=15000)
        assert page.input_value("#run-audience") == "private"
        page.select_option("#run-audience", "public")
        page.click("#run-save")
        deadline = time.time() + 10
        while not patches and time.time() < deadline:
            page.wait_for_timeout(100)
        assert patches and patches[0].get("visibility") == "public", patches
        assert not errors, errors
        # The relationship header rides on signed-in data requests, never on auth traffic.
        rest = [h for m, u, h in requests if "/rest/v1/runs" in u and "id=eq." + run["id"] in u]
        assert rest and all(h.get("x-grinder-run-id") == run["id"] for h in rest)
        assert all("x-grinder-run-id" not in h for _, u, h in requests if "/auth/v1/" in u)
        _no_escape(requests)
    finally:
        page.close()


def test_stranger_sees_private_notice_and_sends_no_run_header(browser, site):
    run = RUNS[0]
    page, requests, patches, errors = _open(browser, site, run, None)
    try:
        page.wait_for_function("() => /private or does not exist/.test(document.getElementById('app').innerText)",
                               timeout=15000)
        text = page.inner_text("#app")
        assert run["title"] not in text
        assert page.query_selector("#run-audience") is None
        assert not patches
        assert all("x-grinder-run-id" not in h for _, _, h in requests)
        _no_escape(requests)
    finally:
        page.close()
