"""The photo editor in a real browser, at 390 and 1440, against the disposable database.

What this proves. A real Chromium loads the shipped `site/` files, signs in as the TEST DATA owner
"casey", and uses the one photo grid in both places it is drawn: the import step and the saved-run
editor. It adds photos by the file picker and by a dropped file, checks that every image fills its
square tile, reorders by mouse drag and by keyboard, removes with Undo, and reads the per-photo label
against the run's audience. After each Save it reads the rows back from the database.

What this does not prove. The stack is `scripts/photo-editor-local-stack.mjs`: the repository's
disposable Postgres and REST shim, the real `/api/run-photos` handler, and a Storage bucket held in
memory. It is not the hosted project. No hosted row is written and nothing is deployed.

Usage: python3 scripts/check-photo-editor.py [--out DIR] [--video]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import struct
import sys
import tempfile
import urllib.request
import zlib
from pathlib import Path
from subprocess import PIPE, Popen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VIEWPORTS = {"390": {"width": 390, "height": 844}, "1440": {"width": 1440, "height": 900}}
COLOURS = {"dawn.png": (214, 120, 60), "ridge.png": (38, 98, 190), "summit.png": (34, 140, 96),
           "notes.png": (120, 70, 160)}
TILES = ".photo-editor-grid .photo-tile[data-photo-id]"


def png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    """A wide TEST DATA image: a coloured field with a pale band, so a crop is easy to see."""
    rows = b""
    for y in range(height):
        row = bytearray()
        for x in range(width):
            band = abs(x - width // 2) < width // 10 or abs(y - height // 2) < height // 12
            row += bytes((245, 245, 235) if band else rgb)
        rows += b"\x00" + bytes(row)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))


def upload(name: str) -> dict:
    return {"name": name, "mimeType": "image/png", "buffer": png(640, 360, COLOURS[name])}


def mint(sub: str, handle: str) -> str:
    header = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').decode().rstrip("=")
    claims = {"sub": sub, "email": handle + "@example.test", "role": "authenticated",
              "aud": "authenticated", "exp": 2_000_000_000}
    return header + "." + base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=") + ".sig"


def session_script(sub: str, handle: str) -> str:
    token = mint(sub, handle)
    value = {"access_token": token, "refresh_token": token, "token_type": "bearer", "expires_in": 86400,
             "expires_at": 2_000_000_000,
             "user": {"id": sub, "aud": "authenticated", "role": "authenticated", "email": handle + "@example.test",
                      "user_metadata": {"user_name": handle, "full_name": handle},
                      "app_metadata": {"provider": "email"}}}
    return ("localStorage.setItem('agentic-strava-auth'," + json.dumps(json.dumps(value)) + ");"
            "localStorage.setItem('ag_onboard_done','1');")


def rest(stack: dict, path: str, token: str | None = None):
    headers = {"apikey": "local-development-only", "Accept-Profile": "strava"}
    if token:
        headers["Authorization"] = "Bearer " + token
    with urllib.request.urlopen(urllib.request.Request(stack["supabase"] + "/rest/v1/" + path, headers=headers),
                                timeout=30) as response:
        return json.loads(response.read().decode())


class Check:
    def __init__(self, page, stack, label, out, slow):
        self.page, self.stack, self.label, self.out, self.slow = page, stack, label, out, slow
        self.failures: list[str] = []
        self.owner = mint(stack["casey"], "casey")

    def expect(self, condition, message):
        if not condition:
            self.failures.append(self.label + ": " + message)

    def pause(self, ms=700):
        if self.slow:
            self.page.wait_for_timeout(int(ms * 1.8))

    def shot(self, name):
        self.page.screenshot(path=str(self.out / (name + "-" + self.label + ".png")), full_page=True)

    def order(self):
        return self.page.eval_on_selector_all(TILES, "els=>els.map(el=>el.dataset.photoId)")

    def labels(self):
        return self.page.eval_on_selector_all(TILES + " .photo-audience", "els=>els.map(el=>el.textContent)")

    def covers(self):
        return self.page.eval_on_selector_all(TILES, "els=>els.map(el=>!!el.querySelector('.photo-cover-tag'))")

    def wait_order(self, wanted):
        self.page.wait_for_function(
            "wanted=>JSON.stringify([...document.querySelectorAll(%s)].map(el=>el.dataset.photoId))===JSON.stringify(wanted)"
            % json.dumps(TILES), arg=wanted)

    def geometry(self, where):
        """Every image fills its square tile, and the controls leave most of the picture visible."""
        tiles = self.page.eval_on_selector_all(TILES, """els=>els.map(el=>{const t=el.getBoundingClientRect(),img=el.querySelector('img'),i=img.getBoundingClientRect(),style=getComputedStyle(img);
          const controls=[...el.children].filter(c=>c!==img).map(c=>c.getBoundingClientRect());
          return {tile:[t.width,t.height],image:[i.left-t.left,i.top-t.top,i.width,i.height],fit:style.objectFit,natural:[img.naturalWidth,img.naturalHeight],
            covered:controls.reduce((sum,c)=>sum+c.width*c.height,0)/(t.width*t.height),inside:controls.every(c=>c.left>=t.left-1&&c.right<=t.right+1&&c.top>=t.top-1&&c.bottom<=t.bottom+1)}})""")
        self.expect(len(tiles) > 0, where + ": no photo tiles")
        for at, tile in enumerate(tiles):
            width, height = tile["tile"]
            left, top, image_width, image_height = tile["image"]
            name = "%s tile %d" % (where, at + 1)
            self.expect(abs(width - height) <= 1 and width >= 100, name + " is not a square of usable size: %r" % tile["tile"])
            self.expect(abs(left) <= 1 and abs(top) <= 1 and abs(image_width - width) <= 1 and abs(image_height - height) <= 1,
                        name + " image does not fill the tile: image %r in tile %r" % (tile["image"], tile["tile"]))
            self.expect(tile["fit"] == "cover", name + " object-fit is " + tile["fit"])
            self.expect(tile["natural"][0] > 0, name + " image did not load")
            self.expect(tile["covered"] < 0.3, name + " controls cover %.0f%% of the photo" % (tile["covered"] * 100))
            self.expect(tile["inside"], name + " has a control outside the tile")
        overflow = self.page.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth")
        self.expect(overflow <= 1, where + ": the page scrolls sideways by %s px" % overflow)
        return tiles

    def drag(self, source_id, target_id):
        """A real mouse drag from one tile onto another."""
        # Bring the grid to the middle of the window first: on a phone the step's action bar is sticky.
        self.page.eval_on_selector(".photo-editor-grid", "el=>el.scrollIntoView({block:'center'})")
        source = self.page.locator('%s[data-photo-id="%s"] img' % (TILES, source_id)).bounding_box()
        target = self.page.locator('%s[data-photo-id="%s"] img' % (TILES, target_id)).bounding_box()
        start = (source["x"] + source["width"] / 2, source["y"] + source["height"] * 0.6)
        end = (target["x"] + target["width"] / 2, target["y"] + target["height"] * 0.6)
        self.page.mouse.move(*start)
        self.page.mouse.down()
        self.page.mouse.move(start[0] + 8, start[1] + 8, steps=3)
        self.page.mouse.move(*end, steps=24 if self.slow else 8)
        self.pause(250)
        self.page.mouse.up()

    def drop_file(self, name):
        """A file dropped on the plus tile, as from the desktop."""
        data = base64.b64encode(upload(name)["buffer"]).decode()
        prevented = self.page.evaluate("""([name,data])=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),transfer=new DataTransfer();
          transfer.items.add(new File([bytes],name,{type:'image/png'}));const tile=document.querySelector('.photo-add-tile');
          tile.dispatchEvent(new DragEvent('dragover',{dataTransfer:transfer,bubbles:true,cancelable:true}));
          const drop=new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true});tile.dispatchEvent(drop);return drop.defaultPrevented}""", [name, data])
        self.expect(prevented, "a dropped file was not taken by the editor")

    def shape(self):
        return self.page.eval_on_selector(TILES, "el=>[...el.children].map(c=>c.tagName+'.'+c.className).join(' ')")

    # ---- the import step ---------------------------------------------------------------------
    def import_step(self):
        page, stack = self.page, self.stack
        revision = hashlib.sha256(("photo editor " + self.label + str(self.slow)).encode()).hexdigest()
        payload = {"schema_version": 1, "harness": "Cursor", "project": "TEST DATA photo editor", "turns_typed": 3,
                   "tool_calls": 4, "measurement_revision": revision, "started": "2026-10-12T19:00:00Z",
                   "rhythm": [1, 2, 1], "trace_basis": "elapsed"}
        page.goto(stack["site"] + "/#import=" + base64.b64encode(json.dumps(payload).encode()).decode())
        page.locator(".post-composer").wait_for()
        page.get_by_role("button", name="Add your story", exact=True).click()
        editor = page.locator(".post-photo-slot .photo-editor")
        editor.wait_for()
        self.pause()
        self.expect(page.locator(".post-photo-slot p:visible").count() == 0, "import step shows an explanatory paragraph")
        self.expect(page.locator(".post-photo-slot select, .post-photo-slot [data-draft-cover]").count() == 0,
                    "import step still has the old role or main-image controls")
        self.shot("import-empty")
        # Picker: two files at once. Then one dropped file.
        page.locator(".photo-add-tile [data-photo-file]").set_input_files([upload("dawn.png"), upload("ridge.png")])
        page.wait_for_function("sel=>document.querySelectorAll(sel).length===2", arg=TILES)
        self.pause()
        self.drop_file("summit.png")
        page.wait_for_function("sel=>document.querySelectorAll(sel).length===3", arg=TILES)
        page.wait_for_function("sel=>[...document.querySelectorAll(sel+' img')].every(i=>i.complete&&i.naturalWidth>0)", arg=TILES)
        self.pause()
        first, second, third = self.order()
        self.geometry("import step")
        self.expect(self.labels() == ["Only you"] * 3, "import step labels before an audience is chosen: %r" % self.labels())
        self.expect("Public" not in editor.inner_text(), "import step says Public before an audience is chosen")
        self.expect(self.covers() == [True, False, False], "import step cover is not the first photo: %r" % self.covers())
        self.expect(editor.locator(".photo-editor-head").inner_text().split() == ["Photos", "3", "of", "6"], "count line: %r" % editor.locator(".photo-editor-head").inner_text())
        shape = self.shape()
        self.shot("import-photos")
        # Drag the third photo onto the first: it becomes the cover.
        self.drag(third, first)
        self.wait_order([third, first, second])
        self.expect(self.covers() == [True, False, False], "cover did not follow the drag")
        self.pause()
        # Keyboard: move it one place later, then back to first.
        handle = page.locator('[data-photo-move="%s"]' % third)
        handle.focus()
        page.keyboard.press("ArrowRight")
        self.wait_order([first, third, second])
        self.expect(page.evaluate("()=>document.activeElement?.dataset.photoMove") == third, "focus left the moved photo")
        self.pause(400)
        page.keyboard.press("Home")
        self.wait_order([third, first, second])
        self.pause(400)
        # Remove, then Undo.
        page.locator('[data-photo-remove="%s"]' % first).click()
        self.wait_order([third, second])
        self.pause()
        page.locator("[data-photo-undo]").click()
        self.wait_order([third, first, second])
        self.pause()
        self.shot("import-reordered")
        # Nothing has left this device.
        self.expect(rest(stack, "runs?select=id&measurement_revision=eq." + revision, self.owner) == [],
                    "a run was saved before the author pressed Save")
        if not self.slow:
            page.reload()
            page.locator(".post-photo-slot .photo-editor").wait_for()
            self.wait_order([third, first, second])
        # The audience step. The label follows it, then the author leaves it at Only me.
        page.get_by_role("button", name="Choose audience", exact=True).click()
        self.expect(page.locator("#i_vis").input_value() == "private", "the audience does not start at Only me")
        page.locator("#i_vis").select_option("public")
        self.pause(500)
        page.locator('#post-pane-2 [data-post-next="1"]').click()
        self.expect(self.labels() == ["Public"] * 3, "import labels after choosing Public: %r" % self.labels())
        self.pause()
        page.get_by_role("button", name="Choose audience", exact=True).click()
        page.locator("#i_vis").select_option("private")
        self.pause(500)
        page.locator("#i_pub").click()
        page.wait_for_url("**/?run=*", timeout=30000)
        run_id = page.url.split("run=")[1].split("#")[0].split("&")[0]
        run = rest(stack, "runs?select=id,visibility&id=eq." + run_id, self.owner)
        self.expect(len(run) == 1 and run[0]["visibility"] == "private", "saved run is not private: %r" % run)
        photos = rest(stack, "run_photos?select=id,sort_position,is_cover,is_selected,is_private,role&run_id=eq." + run_id + "&order=sort_position.asc", self.owner)
        self.expect(len(photos) == 3, "expected three saved photos, found %d" % len(photos))
        self.expect([p["is_cover"] for p in photos] == [True, False, False], "saved cover is not the first photo: %r" % photos)
        self.expect(all(p["is_selected"] and not p["is_private"] and p["role"] == "photo" for p in photos), "saved photo flags: %r" % photos)
        self.expect(rest(stack, "run_photos?select=id&run_id=eq." + run_id) == [], "an anonymous reader can list photos of a private run")
        return run_id, shape, photos

    # ---- the saved-run editor ----------------------------------------------------------------
    def edit_page(self, run_id, import_shape, saved):
        page, stack = self.page, self.stack
        page.goto(stack["site"] + "/?run=" + run_id + "#run-edit")
        editor = page.locator("#run-edit .photo-editor")
        editor.wait_for()
        page.wait_for_function("sel=>document.querySelectorAll(sel).length===3&&[...document.querySelectorAll(sel+' img')].every(i=>i.complete&&i.naturalWidth>0)", arg=TILES)
        self.pause()
        ids = [p["id"] for p in saved]
        self.expect(self.order() == ids, "editor order differs from the saved order")
        self.expect(self.shape() == import_shape, "the saved-run editor draws a different tile from the import step:\n  %s\n  %s" % (self.shape(), import_shape))
        self.expect(page.locator("#run-audience").input_value() == "private", "run audience is not Only me")
        self.expect(self.labels() == ["Only you"] * 3, "labels on a private run: %r" % self.labels())
        self.expect("Public" not in editor.inner_text(), "a private run's photo editor says Public")
        self.expect(editor.locator("p:visible").count() == 0, "saved-run editor shows an explanatory paragraph")
        self.geometry("saved-run editor")
        self.shot("edit-private")
        # The label follows the audience control. Nothing is saved by choosing.
        page.locator("#run-audience").select_option("public")
        self.expect(self.labels() == ["Public"] * 3, "labels after choosing Public: %r" % self.labels())
        self.expect(rest(stack, "runs?select=visibility&id=eq." + run_id, self.owner)[0]["visibility"] == "private",
                    "choosing an audience changed the run before Save")
        self.pause()
        self.shot("edit-public-chosen")
        page.locator("#run-audience").select_option("private")
        self.expect(self.labels() == ["Only you"] * 3, "labels after returning to Only me: %r" % self.labels())
        self.pause(500)
        # Reorder by drag, hide one photo, remove one with Undo, remove it again, then Save.
        self.drag(ids[2], ids[0])
        self.wait_order([ids[2], ids[0], ids[1]])
        self.expect(self.covers() == [True, False, False], "cover did not follow the drag in the editor")
        self.pause()
        page.locator('[data-photo-remove="%s"]' % ids[1]).click()
        self.wait_order([ids[2], ids[0]])
        self.pause()
        page.locator("[data-photo-undo]").click()
        self.wait_order([ids[2], ids[0], ids[1]])
        self.pause()
        page.locator('[data-photo-remove="%s"]' % ids[1]).click()
        self.wait_order([ids[2], ids[0]])
        before = rest(stack, "run_photos?select=id,sort_position,is_selected&run_id=eq." + run_id + "&order=sort_position.asc", self.owner)
        self.expect([p["id"] for p in before] == ids and all(p["is_selected"] for p in before), "the editor wrote before Save changes")
        self.shot("edit-reordered")
        page.locator("#run-save").click()
        page.wait_for_function("()=>!document.querySelector('#run-edit')||document.querySelector('#run-edit').hidden||!location.hash.includes('run-edit')", timeout=30000)
        page.wait_for_load_state("networkidle")
        after = rest(stack, "run_photos?select=id,sort_position,is_selected,is_cover&run_id=eq." + run_id + "&order=sort_position.asc", self.owner)
        self.expect([p["id"] for p in after] == [ids[2], ids[0], ids[1]], "saved order: %r" % after)
        self.expect([p["is_selected"] for p in after] == [True, True, False], "the removed photo is stored, not shown: %r" % after)
        self.expect([p["is_cover"] for p in after] == [True, False, False], "saved cover: %r" % after)
        self.expect(rest(stack, "runs?select=visibility&id=eq." + run_id, self.owner)[0]["visibility"] == "private", "Save changed the audience")
        self.pause(1200)
        self.shot("saved-run")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=None)
    parser.add_argument("--video", action="store_true", help="also record one slow pass at 1440")
    args = parser.parse_args()
    out = Path(args.out) if args.out else Path(tempfile.mkdtemp(prefix="strive-photo-editor-"))
    out.mkdir(parents=True, exist_ok=True)
    proc = Popen(["node", str(ROOT / "scripts/photo-editor-local-stack.mjs")], cwd=str(ROOT), stdout=PIPE, stderr=PIPE, text=True)
    line = proc.stdout.readline()
    try:
        stack = json.loads(line)
    except ValueError:
        proc.kill()
        print("local stack failed to start: " + str(line) + "\n" + (proc.stderr.read() if proc.stderr else ""))
        return 2
    failures: list[str] = []
    results = []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch(headless=True, args=["--no-sandbox"])
            passes = [(label, viewport, False) for label, viewport in VIEWPORTS.items()]
            if args.video:
                passes.append(("video-1440", VIEWPORTS["1440"], True))
            for label, viewport, slow in passes:
                options = {"viewport": viewport}
                if slow:
                    options.update(record_video_dir=str(out / "video"), record_video_size=viewport)
                context = browser.new_context(**options)
                context.add_init_script(session_script(stack["casey"], "casey"))
                page = context.new_page()
                errors: list[str] = []
                page.on("pageerror", lambda exc, errors=errors: errors.append(str(exc)))
                check = Check(page, stack, label, out, slow)
                try:
                    run_id, shape, saved = check.import_step()
                    check.edit_page(run_id, shape, saved)
                except Exception as error:  # a timeout is a failure with a picture, not a crash
                    check.failures.append(label + ": " + type(error).__name__ + ": " + str(error).splitlines()[0])
                    try:
                        check.shot("failure")
                    except Exception:
                        pass
                check.failures += [label + ": page error: " + e for e in errors]
                video = page.video.path() if slow and page.video else None
                context.close()
                failures += check.failures
                results.append({"viewport": label, "passed": not check.failures, "video": str(video) if video else None})
            browser.close()
    finally:
        proc.terminate()
    (out / "check-photo-editor.json").write_text(json.dumps({"results": results, "failures": failures}, indent=2))
    print(json.dumps({"out": str(out), "results": results, "failures": failures}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
