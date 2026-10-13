"""The run photo UI: authenticated reads, uploads, owner and reader views, feed covers.

Each check reads what the real site/photo-grid.js and site/run-photos.js did in jsdom
(tests/fixtures/run_photos_ui_probe.mjs). TEST DATA only, no network.
"""
import json
import subprocess
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHOTOS = (ROOT / "site" / "run-photos.js").read_text()
INDEX = (ROOT / "site" / "index.html").read_text()
RUN = "11111111-1111-4111-a111-111111111111"
LIST = f"/api/run-photos?run_id={RUN}"


@lru_cache(maxsize=1)
def probe():
    return json.loads(subprocess.check_output(["node", "tests/fixtures/run_photos_ui_probe.mjs"], cwd=ROOT, text=True))


def test_photo_ui_uses_bearer_fetch_and_blob_urls():
    owner = probe()["owner"]
    # One list read, then one sized read per photo of this site. The photo whose URL points at
    # another origin is never requested.
    assert owner["paths"] == [LIST, LIST + "&id=p1&w=480", LIST + "&id=p2&w=480"]
    assert owner["authorizations"] == ["Bearer TEST-TOKEN"]
    assert owner["sources"] == ["blob:TEST-1", "blob:TEST-2"]
    assert probe()["tokenInUrl"] is False
    assert "?access_token=" not in PHOTOS and "&access_token=" not in PHOTOS


def test_photo_ui_crops_and_compresses_before_upload():
    # The crop dialog was replaced by the plain grid: the editor keeps the whole image and the
    # tile shows a cover crop. Size rules and the upload contract are unchanged.
    data = probe()
    assert data["owner"]["accept"] == "image/jpeg,image/png,image/webp" and data["owner"]["multiple"] is True
    assert data["tooLarge"] == {"status": ["Choose images smaller than 12 MB.", True], "tiles": 0}
    assert data["staged"] == {"tiles": 3, "writesBeforeSave": 0}
    assert data["upload"] == {"path": "/api/run-photos", "keys": ["image_base64", "run_id"], "run": RUN,
                              "decoded": "TEST DATA image bytes", "authorization": "Bearer TEST-TOKEN"}
    # A file over 3 MB is resized and re-encoded as JPEG on the device before it is sent.
    compress = PHOTOS[PHOTOS.index("async function compressPhoto(file){"):PHOTOS.index("async function openImage(")]
    assert "if(file.size<=3*1024*1024)return file;" in compress
    assert "canvas.toBlob(resolve,'image/jpeg',quality)" in compress and "1600/Math.max(image.naturalWidth,image.naturalHeight)" in compress
    assert "displayed.length<6&&photos.length<12" in PHOTOS
    assert "method:'DELETE'" in PHOTOS


def test_run_page_mounts_photos_for_reader_and_owner_controls():
    assert '<section id="run-photos"></section>' in INDEX
    assert "StriveRunPhotos.mount({client:sb,run:r,slot:$('run-photos'),owner,staged:owner,status," in INDEX
    assert "/run-photos.js" in INDEX and "/run-photos.css" in INDEX
    assert INDEX.index('<script src="/photo-grid.js"></script>') < INDEX.index('<script src="/run-photos.js"></script>')
    assert 'href="#run-photos">Add photos</a>' in INDEX
    data = probe()
    assert data["owner"]["controls"] == {"remove": 2, "move": 2, "file": 1}
    assert data["reader"] == {"images": 2, "controls": 0, "open": 2}


def test_feed_cards_load_managed_photo_cover_without_token_query():
    data = probe()
    # Signed out on a public run: the image is a plain sized URL the browser loads itself.
    assert data["anonymousCover"] == {"sources": [LIST + "&id=p1&w=320"], "paths": [LIST], "authorizations": [None]}
    # Signed in: the bytes are read with the bearer header and shown from a blob URL.
    assert data["signedInCover"] == {"sources": ["blob:TEST-1"], "paths": [LIST, LIST + "&id=p1&w=960"],
                                     "authorizations": ["Bearer TEST-TOKEN"]}
    # The cover the author chose leads, not the first upload.
    assert data["chosenSecond"]["sources"][0] == LIST + "&id=p2&w=320"
    for case in ("anonymousCover", "signedInCover", "chosenSecond"):
        assert not any("access_token" in text or "TEST-TOKEN" in text for text in data[case]["sources"] + data[case]["paths"])
    assert "StriveRunPhotos.mountCovers({client:sb,root:document})" in INDEX
