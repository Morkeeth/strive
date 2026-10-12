"""Three readers, two surfaces, six cells. The visibility check that had never been run.

Readers: the owner, a close friend the owner listed, and a reader the owner did not list.
Surfaces: the run PAGE in a real browser, and the share IMAGE endpoint, `api/run.js` with image=1.

The excluded reader must fail on both. A check nobody has seen fail is not a check, so this script
first runs the excluded reader against a PUBLIC run and requires the check to go GREEN there. If
the excluded reader is invisible to everything, the red result on the close friends run would mean
nothing.

Stack: the repository's disposable stack, PGlite plus the PostgREST and auth shim in
`scripts/disposable-supabase.mjs`, with the same schema and policies from `supabase/strava/*.sql`.
Not the hosted database. No hosted row is written and no hosted account is created.

TEST DATA actors only.
"""
from __future__ import annotations

import json
import os
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from subprocess import PIPE, Popen, run as run_process

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import importlib.util                          # noqa: E402

# Reuse the helpers from the reload check without renaming its file.
_spec = importlib.util.spec_from_file_location(
    "ridge_reload_browser", str(ROOT / "scripts" / "check-ridge-reload-browser.py"))
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

SB_ORIGIN = _mod.SB_ORIGIN
Handler = _mod.Handler
mint = _mod.mint
session = _mod.session
session_script = _mod.session_script
save_run = _mod.save_run
proxy = _mod.proxy

STRANGER = "11000000-0000-0000-0000-000000000003"
BINS = 50
RIDGE = [4 if i % 7 == 0 else i % 3 for i in range(BINS)]
WORKER_BINS = [2 if 10 < i < 30 else 0 for i in range(BINS)]
COMMIT_BINS = [3, 17, 42]

IMAGE_PROBE = r"""
import { createHash } from "node:crypto";
import { ImageResponse } from "@vercel/og";
import { readPublic, card, privateCard } from "../server/public-run.mjs";
import { runtimeConfig } from "../server/runtime-config.mjs";
const [disposable, runId] = process.argv.slice(2);
const config = runtimeConfig();
const patched = (target, options) =>
  fetch(String(target).replace(config.SB_URL, disposable), options);
const run = await readPublic(runId, patched);
const png = async (tree) => {
  const image = new ImageResponse(tree, { width: 1200, height: 630 });
  const bytes = Buffer.from(await image.arrayBuffer());
  return { png: bytes.subarray(1, 4).toString() === "PNG",
           hash: createHash("sha256").update(bytes).digest("hex") };
};
const served = await png(run ? card(run) : privateCard());
const neutral = await png(privateCard());
process.stdout.write(JSON.stringify({
  row: run ? true : false,
  ridge: run ? run.ridge != null : false,
  neutral: served.hash === neutral.hash,
  png: served.png,
}));
"""


def image_surface(disposable: str, run_id: str) -> dict:
    probe = ROOT / "scripts" / "_three-reader-image-probe.mjs"
    probe.write_text(IMAGE_PROBE)
    try:
        done = run_process(["node", str(probe), disposable, run_id],
                           cwd=str(ROOT), capture_output=True, text=True)
        if done.returncode != 0:
            return {"error": done.stderr.strip()[-300:]}
        return json.loads(done.stdout)
    finally:
        probe.unlink(missing_ok=True)


def page_surface(context, base: str, run_id: str) -> dict:
    page = context.new_page()
    try:
        page.goto(base + "/?run=" + run_id, wait_until="networkidle")
        return page.evaluate(
            "() => ({ridge: !!document.querySelector('.post-trail svg .activity-bar'),"
            " title: document.body.innerText.includes('TEST DATA close friends ridge')"
            "        || document.body.innerText.includes('TEST DATA public ridge'),"
            " caption: document.body.innerText.includes('TEST DATA private caption')})")
    finally:
        page.close()


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
    disposable, casey, riley = info["url"], info["casey"], info["riley"]
    print("disposable stack:", disposable)

    # The excluded reader needs a profile, or the run page cannot even render for them.
    request = urllib.request.Request(
        disposable + "/rest/v1/profiles",
        data=json.dumps({"id": STRANGER, "auth_uid": STRANGER, "handle": "test-stranger",
                         "display_name": "TEST DATA Stranger",
                         "name": "TEST DATA Stranger"}).encode(),
        method="POST",
        headers={"apikey": "local-development-only", "Content-Profile": "strava",
                 "Content-Type": "application/json",
                 "Authorization": "Bearer " + mint(STRANGER, "stranger")})
    try:
        urllib.request.urlopen(request, timeout=30).read()
    except urllib.error.HTTPError as exc:
        print("could not seed the excluded reader:", exc.read().decode()[:300])
        proc.kill()
        return 2

    # The owner lists the close friend.
    friend = urllib.request.Request(
        disposable + "/rest/v1/close_friends",
        data=json.dumps({"owner_profile_id": casey, "friend_profile_id": riley}).encode(),
        method="POST",
        headers={"apikey": "local-development-only", "Content-Profile": "strava",
                 "Content-Type": "application/json",
                 "Authorization": "Bearer " + mint(casey, "casey")})
    urllib.request.urlopen(friend, timeout=30).read()

    shared = {"profile_id": casey, "project": "TEST DATA project", "harness": "Codex",
              "prompts": 9, "commits": 3, "tool_calls": 226, "rhythm": [2, 1, 2],
              "schema_version": 1, "trace_basis": "elapsed", "ridge": RIDGE,
              "worker_bins": WORKER_BINS, "commit_bins": COMMIT_BINS,
              "ridge_basis": "wall-time", "ridge_wall_seconds": 1234.5,
              "ridge_tool_calls": 255}
    close_run = save_run(disposable, casey, "casey", dict(
        shared, title="TEST DATA close friends ridge",
        caption="TEST DATA private caption", visibility="close_friends"))
    public_run = save_run(disposable, casey, "casey", dict(
        shared, title="TEST DATA public ridge", caption="TEST DATA public caption",
        visibility="public"))
    print("close friends run:", close_run)
    print("public run:", public_run)

    site = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=site.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d" % site.server_address[1]

    readers = (("owner", casey, "casey"), ("close friend", riley, "riley"),
               ("excluded", STRANGER, "stranger"))
    rows: list[tuple] = []
    failures: list[str] = []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch(headless=True, args=["--no-sandbox"])
            contexts = {}
            for label, sub, handle in readers:
                context = browser.new_context(viewport={"width": 1100, "height": 900})
                context.route(SB_ORIGIN + "/**", lambda route: proxy(route, disposable))
                context.add_init_script(session_script(session(sub, handle)))
                contexts[label] = context

            # THE CONTROL, FIRST. The excluded reader must be able to SEE a public run, or the
            # red result below proves only that this reader sees nothing at all.
            control = page_surface(contexts["excluded"], base, public_run)
            rows.append(("excluded", "page, PUBLIC run (control)", control))
            if not (control["ridge"] and control["title"]):
                failures.append(
                    "control failed: the excluded reader cannot see a public run either, so a red "
                    "result on the close friends run would prove nothing")

            for label, _sub, _handle in readers:
                rows.append((label, "page, close_friends run",
                             page_surface(contexts[label], base, close_run)))
            browser.close()

        for label, _sub, _handle in readers:
            rows.append((label, "image endpoint, close_friends run",
                         image_surface(disposable, close_run)))
        rows.append(("anyone", "image endpoint, PUBLIC run (control)",
                     image_surface(disposable, public_run)))
    finally:
        site.shutdown()
        proc.kill()

    print("")
    print("%-14s %-38s %s" % ("READER", "SURFACE", "RESULT"))
    for label, surface, result in rows:
        print("%-14s %-38s %s" % (label, surface, json.dumps(result, sort_keys=True)))
    print("")

    by_key = {(label, surface): result for label, surface, result in rows}
    owner_page = by_key[("owner", "page, close_friends run")]
    friend_page = by_key[("close friend", "page, close_friends run")]
    excluded_page = by_key[("excluded", "page, close_friends run")]
    if not owner_page["ridge"]:
        failures.append("the owner cannot see their own ridge")
    if not friend_page["ridge"]:
        failures.append("a listed close friend cannot see the ridge")
    if excluded_page["ridge"] or excluded_page["title"] or excluded_page["caption"]:
        failures.append("the excluded reader sees the close friends run on the page")

    excluded_image = by_key[("excluded", "image endpoint, close_friends run")]
    if excluded_image.get("row") or excluded_image.get("ridge"):
        failures.append("the excluded reader gets the row or the ridge from the image endpoint")
    if not excluded_image.get("neutral"):
        failures.append("the excluded reader's image is not the neutral card")
    public_image = by_key[("anyone", "image endpoint, PUBLIC run (control)")]
    if public_image.get("neutral") or not public_image.get("ridge"):
        failures.append("control failed: the image endpoint returns the neutral card for a public "
                        "run too, so the excluded result proves nothing")

    print("NOTE the image endpoint reads with the anonymous key and takes no reader identity, so "
          "the owner and the close friend also receive the neutral card for a close friends run. "
          "That is measured above, not assumed.")
    if failures:
        for failure in failures:
            print("FAIL:", failure)
        return 1
    print("PASS: the excluded reader is red on both surfaces, and both controls went green first.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
