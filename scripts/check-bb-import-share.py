"""Exercise the bb file import, saved card and share page in a phone viewport."""
from __future__ import annotations

import argparse
import importlib.util
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "samples/dropin/bb-thread-log.json"
NAV_FIXTURES = Path(__file__).with_name("check-nav-app-fixtures.py")


def load_auth_fixture():
    spec = importlib.util.spec_from_file_location("nav_fixtures", NAV_FIXTURES)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "site"), **kwargs)

    def log_message(self, *_args):
        pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    fixtures = load_auth_fixture()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            context = browser.new_context(viewport={"width": 390, "height": 844})
            mock = fixtures.build_mock().replace(
                "const tables = {", "const tables = window.fixtureTables = {"
            )
            context.add_init_script(mock)
            context.route(
                "**/*",
                lambda route: route.continue_()
                if route.request.url.startswith(origin)
                else route.fulfill(status=200, body=""),
            )
            context.route("**/api/run-photos**", lambda route: route.fulfill(json={"photos": []}))
            page = context.new_page()
            page.goto(origin + "/?post")
            page.get_by_text("Or drop a session file", exact=True).click()
            with page.expect_file_chooser() as chosen:
                page.get_by_role("button", name="Choose session file", exact=True).click()
            chosen.value.set_files(str(FIXTURE))

            page.get_by_role("heading", name="Your imported session").wait_for()
            assert page.get_by_text("bb", exact=True).count() >= 1
            assert page.get_by_text("2", exact=True).count() >= 1
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            page.screenshot(path=str(args.out / "bb-import-card-390.png"), full_page=True)

            # Put the exact imported metrics into the local database fixture. The production
            # save path has its own browser coverage; this check stays focused on bb import,
            # card rendering and the public share route without a hosted write.
            page.evaluate(
                """() => {
                  const token = location.hash.match(/import=([^&]+)/)[1];
                  const run = JSON.parse(atob(decodeURIComponent(token)));
                  fixtureTables.runs.push({
                    id: 'bb-import-fixture', profile_id: fixtureTables.profiles[0].id,
                    title: 'bb session', harness: run.harness, visibility: 'public',
                    schema_version: run.schema_version,
                    measurement_revision: run.measurement_revision,
                    trace_basis: run.trace_basis, started_at: run.started,
                    created_at: run.started, prompts: run.turns_typed,
                    tool_calls: run.tool_calls, files_touched: run.files_touched,
                    rhythm: run.rhythm
                  });
                }"""
            )
            page.evaluate("async () => { history.pushState(null, '', '/?run=bb-import-fixture'); await route(); }")
            page.get_by_role("link", name="Share this run").wait_for()
            assert "?run=bb-import-fixture" in page.url
            assert page.get_by_text("bb", exact=True).count() >= 1

            share_href = page.get_by_role("link", name="Share this run").get_attribute("href")
            page.evaluate(
                "async href => { history.pushState(null, '', href); await route(); }",
                share_href,
            )
            assert "share=1" in page.url and "run=bb-import-fixture" in page.url
            assert page.locator("#app").inner_text().strip()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            page.screenshot(path=str(args.out / "bb-share-link-390.png"), full_page=True)
            browser.close()
    finally:
        server.shutdown()

    print("PASS: bb export imported, saved card opened, and shared post opened at 390px")


if __name__ == "__main__":
    main()
