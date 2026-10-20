"""The drop-in flow as a stranger on a phone: land, choose a file, see the card, get a link.

Runs headless Chromium (Playwright) at 390 px against a running site, by default the local
drop-in server (node scripts/dropin-dev-server.mjs 8791). Measures time from landing to card and
to link, and fails if:
  - any request is made between choosing the file and pressing Continue on "Anyone with the link",
  - an audience is preselected, or Continue is enabled before one is chosen,
  - the link request carries a key off the allowlist, prompt text, or a home-directory path,
  - the link page does not show the card, or the delete link does not delete it.

Usage: python3 scripts/check-dropin-flow.py [BASE_URL] [SESSION_FILE] [OUT_DIR]
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8791").rstrip("/")
SESSION = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "samples/dropin/claude-edge.jsonl"
OUT = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("/tmp/strive-dropin-flow")
ALLOWED = {"title", "harness", "turns_typed", "tool_calls", "files_touched", "commits", "duration_s", "started_hour", "rhythm", "route", "prompt_provenance"}
SENTINEL = "PROMPT-SENTINEL-7f3a"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    text = SESSION.read_text(encoding="utf-8", errors="ignore")
    probes = [SENTINEL] if SENTINEL in text else []
    requests: list[dict] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        page.on("request", lambda r: requests.append({"url": r.url, "method": r.method, "body": r.post_data, "at": time.monotonic()}))
        t0 = time.monotonic()
        page.goto(BASE + "/?post", wait_until="domcontentloaded")
        page.wait_for_selector("#drop-zone", state="visible")
        t_zone = time.monotonic()
        page.screenshot(path=str(OUT / "1-landing-390.png"))
        page.wait_for_load_state("networkidle")
        mark = len(requests)
        t_pick = time.monotonic()
        page.set_input_files("#drop-file", str(SESSION))
        page.wait_for_selector(".drop-result .fc", state="visible")
        t_card = time.monotonic()
        page.wait_for_timeout(900)  # let the reveal finish before the screenshot
        page.screenshot(path=str(OUT / "2-card-390.png"))
        during = [r for r in requests[mark:]]
        page.fill("#drop-title", "Shipped the drop-in path")
        page.wait_for_timeout(150)
        # The post is step by step: Preview, Who sees it, Share. No audience is preselected and
        # Continue stays off until one is chosen; nothing is sent before Share.
        page.click("#drop-next")
        page.wait_for_selector('.post-pane[data-pane="2"]:not([hidden])', state="visible")
        preselected = page.evaluate("document.querySelectorAll('input[name=drop-aud]:checked').length")
        continue_off = page.is_disabled("#drop-continue")
        page.screenshot(path=str(OUT / "2b-audience-390.png"))
        page.click('label.aud-opt:has(input[value="unlisted"])')
        before_share = [r for r in requests[mark:] if r["method"] != "GET" or r["body"]]
        before_link = len(requests)
        t_click = time.monotonic()
        page.click("#drop-continue")
        page.wait_for_selector("#drop-url", state="visible")
        t_link = time.monotonic()
        page.screenshot(path=str(OUT / "3-link-390.png"), full_page=True)
        posts = [r for r in requests[before_link:] if r["method"] == "POST"]
        url = page.get_attribute("#drop-url", "href")
        delete_url = page.inner_text("#drop-delete")
        card_text = page.inner_text(".drop-result .fc")
        # The link page, as the person who receives it.
        other = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        other.goto(url, wait_until="networkidle")
        shared = other.inner_text("main")
        robots = other.get_attribute('meta[name="robots"]', "content")
        other.screenshot(path=str(OUT / "4-shared-390.png"), full_page=True)
        other.goto(delete_url, wait_until="domcontentloaded")
        other.click("#del")
        other.wait_for_function("document.getElementById('state').textContent.startsWith('Deleted')")
        gone = other.goto(url, wait_until="domcontentloaded").status
        browser.close()

    failures = []
    # The claim on the page is that nothing from the file leaves the device before Share.
    # The page may still finish its own feed read (a GET with no body); that carries nothing from
    # the file. Any request that sends a body, is not a GET, or names file content fails.
    leaking = [r for r in during if r["method"] != "GET" or r["body"] or "/api/link" in r["url"]
               or any(probe in r["url"] for probe in probes + ["/Users/", "/home/"])]
    if leaking:
        failures.append(f"{len(leaking)} request(s) carried data while reading and drawing the card: " + ", ".join(r["url"][:120] for r in leaking[:5]))
    if preselected:
        failures.append(f"{preselected} audience(s) were preselected; the person must choose")
    if not continue_off:
        failures.append("Continue was enabled before an audience was chosen")
    if before_share:
        failures.append(f"{len(before_share)} request(s) carried data before Share")
    if len(posts) != 1 or not posts[0]["url"].endswith("/api/link"):
        failures.append(f"expected exactly one POST to /api/link, saw {[r['url'] for r in posts]}")
    else:
        body = json.loads(posts[0]["body"])
        extra = set(body) - ALLOWED
        if extra:
            failures.append(f"link payload carries keys off the allowlist: {sorted(extra)}")
        raw = posts[0]["body"]
        for probe in probes + ["/Users/", "/home/", "file_path", "git commit"]:
            if probe in raw:
                failures.append(f"link payload contains {probe!r}")
    if "Shipped the drop-in path" not in shared:
        failures.append("the link page does not show the card title")
    if robots is None or "noindex" not in robots:
        failures.append("the link page is indexable")
    if gone != 404:
        failures.append(f"the deleted link still answers {gone}")
    timings = {
        "landing_to_drop_zone_s": round(t_zone - t0, 2),
        "choose_file_to_card_s": round(t_card - t_pick, 2),
        "landing_to_card_s": round(t_card - t0, 2),
        "get_link_click_to_link_s": round(t_link - t_click, 2),
        "landing_to_link_s": round(t_link - t0, 2),
        "requests_while_reading": len(during),
        "requests_while_reading_carrying_data": len(leaking),
        "requests_while_reading_urls": [r["method"] + " " + r["url"][:90] for r in during],
        "session_file": str(SESSION.name),
        "card_text": " ".join(card_text.split())[:200],
    }
    (OUT / "timings.json").write_text(json.dumps(timings, indent=2))
    print(json.dumps(timings, indent=2))
    if failures:
        raise SystemExit("DROP-IN FLOW FAILED:\n- " + "\n- ".join(failures))
    print(f"Drop-in flow passed at 390 px. Screenshots in {OUT}")


if __name__ == "__main__":
    main()
