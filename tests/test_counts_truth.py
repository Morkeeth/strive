"""Tool-call counts agree across /r/, SPA strip, Explore, share, and slice labels."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / "tests" / "fixtures" / "counts_truth_probe.mjs"
INDEX = (ROOT / "site" / "index.html").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
CONTRACT = (ROOT / "site" / "run-contract.js").read_text()


def test_cross_surface_counts_agree_and_slice_is_labelled():
    out = subprocess.check_output(["node", str(PROBE)], text=True, cwd=ROOT)
    assert '"ok":true' in out.replace(" ", "")


SIGN_IN = r"""
const fs=require('fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<body></body>',{url:'https://strive.test/?run=abc',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
const s=fs.readFileSync('site/index.html','utf8');
const signIns=[];let cleared=0;
Object.assign(w,{auth:{signIn:async(provider,o)=>{signIns.push([provider,o.returnTo])}},$:id=>d.getElementById(id),status:()=>{},stashImport:()=>true,
 PROVIDERS_ENABLED:['github','email'],providerLabel:p=>p==='github'?'GitHub':p,clearPendingXudos:()=>{cleared++},GrinderAuth:{mountEmailForm:()=>{}}});
w.eval(s.slice(s.indexOf('function showSignIn(opts={}){'),s.indexOf('function viewIdentitySetup(')));
(async()=>{
 w.showSignIn({reason:'social',returnTo:'?run=abc'});
 const social={title:d.getElementById('signin-title').textContent,copy:d.getElementById('signin-explanation').textContent,hint:d.querySelector('#signin-dialog .hint').textContent,
  returnTo:w.sessionStorage.getItem('ag_social_return'),buttons:[...d.querySelectorAll('[data-provider]')].map(b=>b.textContent)};
 d.querySelector('[data-provider="github"]').click();await new Promise(r=>setTimeout(r,0));
 d.getElementById('signin-close').click();
 w.showSignIn({});
 const plain={title:d.getElementById('signin-title').textContent,copy:d.getElementById('signin-explanation').textContent,dialogs:d.querySelectorAll('dialog').length};
 process.stdout.write(JSON.stringify({social,plain,signIns,cleared}));w.close();
})().catch(e=>{console.error(e);process.exitCode=1});
"""


def test_stranger_social_sign_in_copy_is_wired():
    # The real dialog, opened the way a signed-out cheer or follow opens it. The copy named only
    # "cheer this run or follow the builder" until project follows arrived (27120dc, 7 Oct 2026).
    out = json.loads(subprocess.run(["node", "-e", SIGN_IN], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    assert out["social"] == {
        "title": "Continue on __BRAND__",
        "copy": "Sign in to follow a project or builder, or cheer a run. You will return here after signing in. Nothing posts until you choose.",
        "hint": "Closing or cancelling sign-in posts nothing and changes no audience.",
        "returnTo": "?run=abc",
        "buttons": ["Continue with GitHub"],
    }
    assert out["signIns"] == [["github", "?run=abc"]] and out["cleared"] == 1   # closing drops the pending XUDOS
    assert out["plain"] == {"title": "Keep your place", "dialogs": 1,
                            "copy": "Sign in to keep your profile and responses connected. You will return to this preview or social action."}
    assert "Runs stay private until" not in INDEX and "Nothing is shared until" not in INDEX
    # A signed-out cheer, project follow and event join all open it as a stranger.
    assert "if(!ME){rememberXudos(runId);showSignIn({reason:'social',returnTo:'?run='+encodeURIComponent(runId)});return;}" in INDEX
    assert "signIn:()=>showSignIn({reason:'social'})" in INDEX
    assert "if(!ME){showSignIn({reason:'social'});return}" in INDEX
    assert "toolCallCount" in CONTRACT
    assert "in this slice" in CONTRACT
