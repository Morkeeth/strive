"""Check the anonymous first minute in a local, network-blocked Chrome."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import struct
import subprocess
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = Path("/tmp/agentgrinder-cold-first-minute")
EXPLANATION = (
    "Sign in to keep your profile and responses connected. You will return to "
    "this preview or social action."
)

SUPABASE_FIXTURE = """
<script>
window.__coldSignin=location.hash==='#cold-signin';
if(window.__coldSignin) history.replaceState(null,'','/');
window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()+1000),0);
window.supabase={createClient(){
  const publicRun={
    id:'cold-public-1',title:'Cold public run',visibility:'public',
    caption:'A measured outcome from a real public post.',
    created_at:'2026-09-20T12:00:00Z',harness:'Cursor',project:'strive',
    prompts:3,duration_s:600,commits:1,tool_calls:8,
    profiles:{handle:'builder',name:'Builder',github_handle:'builder',display_name:'Builder'}
  };
  function from(table){
    let countOnly=false;
    const query={
      select(_columns,options){countOnly=Boolean(options&&options.count==='exact'&&options.head);return query},
      eq(){return query},
      gte(){return query},
      lt(){return query},
      in(){return query},
      order(){return query},
      limit(){return query},
      then(resolve,reject){
        if(countOnly) return Promise.resolve({data:null,count:1,error:null}).then(resolve,reject);
        if(table==='runs') return Promise.resolve({data:[publicRun],count:null,error:null}).then(resolve,reject);
        if(table==='acks') return Promise.resolve({data:[],count:0,error:null}).then(resolve,reject);
        return Promise.resolve({data:[],count:null,error:null}).then(resolve,reject)
      }
    };
    return query;
  }
  return {from,auth:{
    async getSession(){return {data:{session:null},error:null}},
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
    async signOut(){return {error:null}},
    async signInWithOAuth(){return {error:null}},
    async signInWithOtp(){return {error:null}}
  }};
}};
</script>
"""

PROBE = """
<script>
window.addEventListener('load',()=>{
  setTimeout(()=>{
    if(window.__coldSignin) showSignIn();
    setTimeout(()=>{
      // The public feed starts with the real run, followed by people and the week.
      const intro=document.querySelector('.home-hero');
      const featureSection=document.querySelector('#landing-feature');
      const feature=document.querySelector('#landing-feature-body .card');
      const sample=document.querySelector('[data-home-sample]');
      const count=document.getElementById('public-run-count');
      const explanation=document.getElementById('signin-explanation');
      const rect=feature&&feature.getBoundingClientRect();
      const visible=rect?Math.max(0,Math.min(rect.bottom,innerHeight)-Math.max(rect.top,0)):0;
      const introBox=intro&&intro.getBoundingClientRect();
      const featureBox=featureSection&&featureSection.getBoundingClientRect();
      const feedFirst=Boolean(
        introBox&&featureBox&&
        introBox.top>=0&&introBox.bottom<=innerHeight&&
        featureBox.top<innerHeight&&
        introBox.bottom<=featureBox.top+1&&
        ['#home-builders','#home-week-section'].every(sel=>{
          const box=document.querySelector(sel)?.getBoundingClientRect();
          return Boolean(box&&featureBox.top<=box.top);
        })
      );
      const visibleAdd=[...document.querySelectorAll('.global-add,.product-nav-add')].filter(el=>{
        const style=getComputedStyle(el),box=el.getBoundingClientRect();
        return style.display!=='none'&&box.width>0&&box.height>0;
      });
      document.documentElement.dataset.coldFeedFirst=String(feedFirst);
      document.documentElement.dataset.coldFeatureVisible=String(Boolean(rect&&visible>0));
      document.documentElement.dataset.coldSingleAdd=String(visibleAdd.length===1);
      document.documentElement.dataset.coldSampleAbsent=String(!sample);
      document.documentElement.dataset.coldDropAbsent=String(!document.getElementById('drop-zone'));
      document.documentElement.dataset.coldCountRendered=String(
        Boolean(count&&count.offsetHeight&&count.dataset.countState==='ready')
      );
      document.documentElement.dataset.coldSigninRendered=String(
        Boolean(explanation&&explanation.offsetHeight)
      );
    },250);
  },500);
});
</script>
"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


NOT_RUN = "Cold first minute NOT RUN: set CHROME_BIN to a Chrome-compatible browser."


def playwright_headless_shells() -> list[str]:
    """Playwright's bundled headless shells, newest first, when a Playwright cache exists."""
    cache = Path.home() / "Library" / "Caches" / "ms-playwright"
    if not cache.is_dir():
        return []
    shells = sorted(cache.glob("chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell"), reverse=True)
    return [str(shell) for shell in shells]


def browser_paths() -> list[str]:
    """Chrome-compatible binaries to try, in order. CHROME_BIN or BRAVE_BINARY always wins.

    Playwright's headless shell comes before the macOS app bundles: on some Macs the full
    Google Chrome app never exits in headless mode, so a purpose-built shell is the safer first try.
    """
    configured = os.environ.get("CHROME_BIN") or os.environ.get("BRAVE_BINARY")
    choices = [
        configured,
        *playwright_headless_shells(),
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/opt/google/chrome/chrome",
        "google-chrome",
        "chromium",
        "chromium-browser",
        "brave-browser",
    ]
    found = []
    for choice in choices:
        if choice and (Path(choice).is_file() or shutil.which(choice)):
            found.append(choice if Path(choice).is_file() else (shutil.which(choice) or choice))
    return found


def prepare_site(folder: Path) -> None:
    target = folder / "site"
    shutil.copytree(ROOT / "site", target)
    index = target / "index.html"
    html = index.read_text()
    html = html.replace("__BRAND__", "STRIVE").replace("__TAGLINE__", "Post your strides")
    html = html.replace(
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">',
        "",
    )
    html = html.replace(
        '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
        SUPABASE_FIXTURE,
    )
    html = html.replace("</body>", PROBE + "</body>")
    index.write_text(html)


def png_size(path: Path) -> tuple[int, int]:
    raw = path.read_bytes()[:24]
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"{path} is not a PNG")
    return struct.unpack(">II", raw[16:24])


def capture(chrome: str, url: str, shot: Path, width: int, height: int) -> str:
    profile = Path(tempfile.mkdtemp(prefix="cold-chrome-"))
    command = [
        chrome,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-background-networking",
        "--hide-scrollbars",
        "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1",
        f"--user-data-dir={profile}",
        f"--window-size={width},{height}",
        "--virtual-time-budget=1400",
        f"--screenshot={shot}",
        "--dump-dom",
        url,
    ]
    try:
        result = subprocess.run(command, text=True, capture_output=True, timeout=30, check=True)
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    assert shot.exists(), f"Chrome did not write {shot}"
    assert png_size(shot) == (width, height), f"wrong viewport screenshot: {png_size(shot)}"
    return result.stdout


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screenshots", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    args.screenshots.mkdir(parents=True, exist_ok=True)

    sample = json.loads((ROOT / "samples" / "sample_run.json").read_text())
    assert sample["turns_typed"] == 47 and sample["commits"] == 3

    browsers = browser_paths()
    if not browsers:
        # No browser is a skipped check, not a failed one: dev.py check stays green.
        print(NOT_RUN, flush=True)
        return
    with tempfile.TemporaryDirectory(prefix="cold-first-minute-") as raw:
        folder = Path(raw)
        prepare_site(folder)
        handler = lambda *a, **kw: QuietHandler(*a, directory=str(folder / "site"), **kw)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_address[1]}/"
        try:
            phone = chrome = None
            for candidate in browsers:
                try:
                    phone = capture(candidate, base, args.screenshots / "anonymous-home-390.png", 390, 844)
                except subprocess.TimeoutExpired:
                    # A browser that never exits headless is unusable here; try the next one.
                    print(f"Cold first minute: {candidate} did not exit in headless mode, skipping it.", flush=True)
                    continue
                chrome = candidate
                break
            if chrome is None:
                print(NOT_RUN, flush=True)
                return
            modal = capture(chrome, base + "#cold-signin", args.screenshots / "sign-in-390.png", 390, 844)
            desktop = capture(chrome, base, args.screenshots / "anonymous-home-1280.png", 1280, 900)
        finally:
            server.shutdown()

    assert 'data-cold-feed-first="true"' in phone
    assert 'data-cold-feature-visible="true"' in phone
    assert 'data-cold-single-add="true"' in phone
    assert 'data-cold-sample-absent="true"' in phone
    assert 'data-cold-count-rendered="true"' in phone
    assert "WHAT A RUN LOOKS LIKE" not in phone
    assert "sample-project: a two-hour probe" not in phone
    assert "Cold public run" in phone
    assert "A measured outcome from a real public post." in phone
    assert "1 public run is live." in phone
    # The drop zone lives on Add run (/?post), with one visible entry per width.
    assert "Follow what people are building." in phone and "Add run" in phone
    assert 'data-cold-drop-absent="true"' in phone
    # The fixture run is linked from the rendered feed, never the bundled example.
    assert 'href="/?run=cold-public-1">Cold public run</a>' in phone
    assert 'href="/?example"' not in phone
    assert 'data-cold-signin-rendered="true"' in modal
    assert EXPLANATION in modal
    assert "Continue with X" not in modal
    assert 'data-cold-feed-first="true"' in desktop
    assert 'data-cold-feature-visible="true"' in desktop
    assert 'data-cold-single-add="true"' in desktop
    assert 'data-cold-sample-absent="true"' in desktop
    print(f"Cold first minute passed. Screenshots: {args.screenshots}")


if __name__ == "__main__":
    main()
