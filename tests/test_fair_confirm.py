"""Free Lunch confirm (server/fair-confirm.mjs, site/fair.js): off without a secret, signs only a real action."""
import base64
import json
import subprocess
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]


def test_confirm_module_with_a_fake_network():
    out = subprocess.run(["node", "scripts/test-fair-confirm.mjs"], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr[-2000:]


def test_the_page_strips_the_challenge_and_holds_no_secret():
    fair = (ROOT / "site/fair.js").read_text()
    assert "/^fair_challenge(=|$)/" in fair and "replaceState" in fair
    assert "SECRET" not in fair.upper().replace("NEVER HOLDS A SECRET", "")
    index = (ROOT / "site/index.html").read_text()
    assert '<script src="/fair.js"></script>' in index
    # Load the shipped page module on an address that carries a challenge, then run the page's
    # own helper for a saved run.
    script = r"""
const fs=require('fs'),vm=require('vm'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('site/index.html','utf8'),fair=fs.readFileSync('site/fair.js','utf8');
const CH='11111111-2222-4333-8444-555555555555';
const visit=async(search,reply={confirmed:true})=>{
 const w=new JSDOM('',{url:'https://strive.test/'+search,runScripts:'outside-only'}).window,requests=[],said=[];
 w.fetch=async(url,o)=>{requests.push({url,auth:o.headers.Authorization||null,body:JSON.parse(o.body)});return {status:200,json:async()=>reply}};
 w.eval(fair);
 const after=w.location.pathname+w.location.search+w.location.hash,stored=w.sessionStorage.getItem('strive_fair_challenge');
 const ctx={window:w,StriveFair:w.StriveFair,status:t=>said.push(t),sb:{auth:{getSession:async()=>({data:{session:{access_token:'TEST-ACCESS'}}})}}};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('async function fairConfirmRun(id){'),html.indexOf('async function viewRun(id){')),ctx);
 await ctx.fairConfirmRun('saved-run');
 const out={after,stored,requests,said,left:w.sessionStorage.getItem('strive_fair_challenge')};w.close();return out;};
(async()=>process.stdout.write(JSON.stringify({
 visitor:await visit('?post&fair_challenge='+CH+'&x=1#drop-zone'),
 refused:await visit('?fair_challenge='+CH,{confirmed:false}),
 forged:await visit('?post&fair_challenge=not-a-uuid'),
 nobody:await visit('?post')})))().catch(e=>{console.error(e);process.exit(1)});
"""
    seen = json.loads(subprocess.check_output(["node", "-e", script], cwd=ROOT, text=True))
    challenge = "11111111-2222-4333-8444-555555555555"
    # The challenge leaves the address at once and the rest of the address is kept as typed.
    assert seen["visitor"]["after"] == "/?post&x=1#drop-zone" and seen["visitor"]["stored"] == challenge
    assert seen["refused"]["after"] == "/" and seen["forged"]["after"] == "/?post" and seen["forged"]["stored"] is None
    # A saved run is confirmed by one request that carries the visitor's own session and the
    # ids, and no signature or secret: the server signs.
    assert seen["visitor"]["requests"] == [{"url": "/api/fair/confirm", "auth": "Bearer TEST-ACCESS",
                                           "body": {"challengeId": challenge, "kind": "run", "id": "saved-run"}}]
    assert seen["visitor"]["said"] == ["Free Lunch has confirmed your visit."] and seen["visitor"]["left"] is None
    assert len(seen["refused"]["requests"]) == 1 and seen["refused"]["said"] == [] and seen["refused"]["left"] == challenge
    # No visit from Free Lunch, or a forged id, means no call at all.
    assert seen["forged"]["requests"] == [] and seen["nobody"]["requests"] == [] and seen["nobody"]["stored"] is None
    # The helper and every path that saves a new run: the manual composer, the import, and the
    # import with images (site/photo-draft.js, added since this count was 3). Each call sits
    # with the move to the saved run's address, so it can only follow a confirmed save.
    calls = [line for line in index.splitlines() if "fairConfirmRun(" in line]
    assert index.count("fairConfirmRun(") == 4 and len(calls) == 4
    assert calls[0] == "async function fairConfirmRun(id){"
    assert "if(created)fairConfirmRun(id)" in calls[1]
    for line, saved in zip(calls[2:], ("runId", "published.id")):
        assert f"history.replaceState(null,'','/?run='+{saved});fairConfirmRun({saved});" in line
    # The import does exactly that: a new save is confirmed once; opening a run that already
    # exists, or a save that failed, is not a new action and is not confirmed.
    capture = {"schema_version": 1, "measurement_revision": "d" * 64, "harness": "Codex", "project": "alpha",
               "turns_typed": 1, "tool_calls": 2, "trace_basis": "timestamped native events", "rhythm": [1, 1]}
    token = quote(base64.b64encode(json.dumps(capture).encode()).decode(), safe="")
    def save(**spec):
        return json.loads(subprocess.check_output(
            ["node", str(ROOT / "tests/fixtures/import_flow_probe.mjs"), str(ROOT),
             "https://striverun.app/#import=" + token, json.dumps({"me": True, **spec})], cwd=ROOT, text=True))
    assert save()["fairConfirms"] == ["saved-run"]
    assert save(prior=[{"id": "first-run", "visibility": "private"}])["fairConfirms"] == []
    assert save(insertError={"message": "Failed to fetch"})["fairConfirms"] == []
    assert 'root.StriveFair.confirm("link", body.id, null, body.fair_ticket)' in (ROOT / "site/dropin.js").read_text()
