"""Early-alpha status, feedback delivery, and Coach roadmap copy stay honest."""
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
INDEX = (SITE / "index.html").read_text()
READING = [
    (SITE / name).read_text()
    for name in ("about.html", "methodology.html", "privacy.html", "terms.html", "404.html")
]


def test_early_alpha_is_visible_in_the_app_and_reading_pages():
    assert '<span class="alpha-label">Alpha</span>' in INDEX
    for page in READING:
        assert '<span class="alpha-label">Early alpha</span>' in page


def test_reachable_coach_copy_says_planned_and_not_live():
    about = (SITE / "about.html").read_text()
    methodology = (SITE / "methodology.html").read_text()
    setup = INDEX[INDEX.index("function sidePanels(") : INDEX.index("function skeletonCard(")]
    assert "Coach is on the roadmap" in about
    assert "It is not available" in about
    assert "Coach is on the roadmap" in methodology
    assert "does not generate a Coach review" in methodology
    assert "Planned · not live" in setup
    assert "Bedrock coach" not in setup
    assert "optional network mode" not in setup


def test_send_feedback_uses_the_authenticated_persisted_delivery_contract():
    assert 'roadmapFeedback.open()' in INDEX
    assert 'src="/roadmap-feedback.js"' in INDEX
    for page in READING:
        assert 'href="/?feedback">Send feedback</a>' in page
    # Exercise the actual persistent dialog: auth gate, trimmed RPC text, failed draft retention.
    subprocess.run(['node','-e',r"""
const fs=require('fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const w=new JSDOM('',{url:'https://strive.test/',runScripts:'outside-only'}).window;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
w.eval(fs.readFileSync('site/roadmap-feedback.js','utf8'));
let viewer=null,failed=false,signins=0;const calls=[];
const ui=w.StriveFeedback({me:()=>viewer,signIn:()=>signins++,client:{rpc:async(name,args)=>{calls.push({name,args});return failed?{error:{message:'TEST DATA failed'}}:{data:true}}}});
ui.open();const f=w.document.querySelector('form'),message=f.elements.message;
(async()=>{try{
 assert.equal(message.maxLength,2000);message.value=' TEST DATA feedback ';
 await f.onsubmit({preventDefault(){}});assert.equal(signins,1);assert.equal(calls.length,0);
 viewer={id:'fixture-owner'};ui.open();await f.onsubmit({preventDefault(){}});
 assert.equal(calls[0].name,'save_feedback');assert.equal(calls[0].args.p_message,'TEST DATA feedback');assert.equal(message.value,'');
 failed=true;message.value='TEST DATA keep this draft';await f.onsubmit({preventDefault(){}});
 assert.equal(message.value,'TEST DATA keep this draft');assert.match(w.document.querySelector('[role=status]').textContent,/Your text is still here/);
}finally{ui.destroy();w.close()}})().catch(e=>{console.error(e);process.exitCode=1});
"""],cwd=ROOT,check=True)


def test_active_interface_uses_plain_social_and_account_labels():
    social = (SITE / "social.js").read_text()
    people = (SITE / "people.js").read_text()
    account = (SITE / "account.js").read_text()
    privacy = (SITE / "privacy.html").read_text()
    terms = (SITE / "terms.html").read_text()
    for source in (INDEX, social, people, account, privacy, terms):
        for retired in ("Back to Responses", ">Discuss<", "ACKs recognise", "Your account"):
            assert retired not in source
    assert ">Reply</a>" in INDEX
    assert "Back to Notifications" in social and "Back to Notifications" in people
    assert "<h1>Settings</h1>" in account
    assert "XUDOS recognise real contributions" in terms
