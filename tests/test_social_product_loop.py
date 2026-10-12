"""The public UI stays focused on posting real runs and responding to them."""
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
MIGRATION = (ROOT / "supabase" / "migrations" / "2026-09-14-run-post-fields.sql").read_text()


def test_post_page_exposes_priority_harnesses_and_private_preview():
    block = INDEX[INDEX.index("async function viewPost()") : INDEX.index("async function viewExplore()")]
    connect = INDEX[INDEX.index("function connectBodyHtml()") : INDEX.index("function wireConnectCopies(")]
    importer = INDEX[INDEX.index("async function importRun(){") : INDEX.index("async function viewShareRun(")]
    assert "${connectBodyHtml()}" in block
    assert "capture → preview → share" not in block
    assert "Add a run" in block
    # Draw the page body with the shipped code (site/post-flow.js since b803b86).
    page = json.loads(subprocess.check_output(
        ["node", str(ROOT / "tests/fixtures/connect_body_probe.mjs"), str(ROOT)], cwd=ROOT, text=True))
    assert "capture → preview → share" not in page["body"]
    # The priority harnesses are the four choices the page opens on, in this order. Three open a
    # local session picker (dc6cc32); Grok Bot is asked through the agent guide.
    assert [source["name"] for source in page["sources"]] == ["Cursor", "Claude Code", "Codex", "Grok Bot"]
    for source in ("cursor", "claude", "codex"):
        command = f"uvx --from __CAPTURE_PACKAGE__ strive sessions --harness {source} --open --site __ORIGIN__"
        assert page["picks"][source]["command"] == command and page["picks"][source]["quick"] is True
    assert page["picks"]["grok"]["agent"] is True and page["picks"]["grok"]["quick"] is False
    assert "/agents.md" in page["picks"]["grok"]["agentCopy"]
    # Since ba3cf50 the Grok instructions are the served agent guide, not docs/GROK-PUSH.md.
    assert {"href": "/agents.md", "text": "MCP, Grok and other agent instructions"} in page["links"]
    assert "docs/GROK-PUSH.md" not in page["body"]
    # Per-tool setup is secondary: one closed fold, with the auto-detect command inside it.
    assert "const capture=ONE_LINE('auto')" in connect
    assert page["setup"]["open"] is False
    assert page["setup"]["summary"] == "Import setupEditor plugins, terminal and other sources"
    assert "agentgrinder grind --harness auto --push" in page["setup"]["terminalCommand"]
    # Private preview: nothing is saved by looking, and a saved import starts as Only me.
    assert page["intro"] == "Open a local session picker, then check your private preview. Nothing is saved online yet."
    assert page["hints"] == ["You can preview without signing in. Nothing is saved until you choose to save it."]
    assert '<option value="private" selected>Only me</option>' in importer
    assert "The run stays private unless you choose another audience and save." in importer
    assert "visibility:'private'" in (ROOT / "site" / "import-row.js").read_text()


def test_card_shows_builder_project_session_caption_and_output():
    card = INDEX[INDEX.index("function runCard(") : INDEX.index("function wireKudos()")]
    assert "runAttribution(r)" in card
    for field in ("project", "started_at", "caption", "output_url"):
        assert field in card
    assert "Open ${esc(ridgeOutput||'output')}" in card
    assert "chosenRunHero" in card
    # The author's words come first. Since 5fba4b2 the recorded facts sit between the caption
    # and the visual (before that the visual came second).
    assert card.index("${r.caption?") < card.index("${metricStrip()}") < card.index("${visual}")
    assert ">Project<" in card
    assert "Code activity" in card
    # The fold was "Explore this run" until 00bdaf8 renamed it for what it holds.
    assert '<summary>Receipts and measurements</summary>' in card and "Explore this run" not in INDEX
    assert card.index("${visual}") < card.index("${explore}</div>`; }")
    assert "card-follow" in card
    assert "runHeroChoices" in INDEX
    assert "card-harness" in card
    assert "run-metrics" in card
    assert "heroStats" in card
    assert "run-rank" not in card
    assert "vptHtml(r)" not in card


def test_social_actions_remain_in_the_focused_app():
    assert ".from(\"grinder_follows\")" in SOCIAL
    assert ".from(\"grinder_replies\")" in SOCIAL
    assert "Send XUDOS" in INDEX
    assert "ACK the work" not in INDEX
    assert "Send ACK" not in INDEX
    assert "Notifications" in SOCIAL
    assert "/?people" in SOCIAL
    assert "IntersectionObserver" in SOCIAL
    assert "Open exact reply" in SOCIAL
    assert "ag_response_return" in SOCIAL
    assert "Oscar and Eric" in SOCIAL
    assert "Grokbot Builders Sunday" not in SOCIAL
    assert "Grokbot Builders Sunday" not in INDEX
    assert "luma.com" not in INDEX
    assert "eventChip" in INDEX or "${eventChip}" in INDEX
    # XUDOS is one tap since 2d8c81a: the explanatory tip (xudos-tip) is gone and the card's
    # action row is the button. Draw that row with the shipped module.
    assert "xudos-tip" not in INDEX
    rows = json.loads(subprocess.check_output(["node", "-e", """
const {JSDOM}=require('jsdom'),F=require('./site/feed-card.js');
const read=o=>{const d=new JSDOM(F.actions(o)).window.document,b=d.querySelector('button.kudo');
 return {button:b&&{run:b.dataset.run,to:b.dataset.to,label:b.getAttribute('aria-label'),on:b.classList.contains('on')},
  buttons:d.querySelectorAll('button').length,links:[...d.querySelectorAll('a')].map(a=>[a.textContent.trim(),a.getAttribute('href')])}};
const base={id:'run-1',to:'author',count:2,shareHref:'/?share=1&run=run-1',commentHref:'#grind-thread'};
process.stdout.write(JSON.stringify({fresh:read({...base,acked:false}),sent:read({...base,acked:true}),mine:read({...base,mode:'mine'}),preview:read({mode:'preview'})}));
"""], cwd=ROOT, text=True))
    links = [["Comment", "#grind-thread"], ["Share", "/?share=1&run=run-1"]]
    assert rows["fresh"] == {"button": {"run": "run-1", "to": "author", "label": "Send XUDOS, 2 so far", "on": False}, "buttons": 1, "links": links}
    assert rows["sent"] == {"button": {"run": "run-1", "to": "author", "label": "XUDOS sent, 2 so far", "on": True}, "buttons": 1, "links": links}
    # Nobody sends XUDOS to their own run, and an unsaved preview has nothing to press.
    assert rows["mine"] == {"button": None, "buttons": 0, "links": links}
    assert rows["preview"] == {"button": None, "buttons": 0, "links": []}
    toggle = INDEX[INDEX.index("async function toggleXudos(button){") : INDEX.index("function consumePendingXudos(){")]
    assert "sb.from('acks').insert({from_profile:ME.id,to_profile:toProfile,run_id:runId,reason:'appreciated',same_owner:false})" in toggle
    assert "sb.from('acks').delete().eq('run_id',runId).eq('from_profile',ME.id)" in toggle
    assert "if(ME.id===toProfile)return;" in toggle
    assert "b.addEventListener('click',()=>void toggleXudos(b));" in INDEX
    assert "GrinderFeed.actions({id:r.id,shareHref:'/?share=1&run='+encodeURIComponent(r.id),to:r.profile_id" in INDEX
    assert "Scene photo URL" not in INDEX
    # Photos are added on the saved run, in its own slot (the editor's copy is not pinned here).
    assert '<section id="run-photos"></section>' in INDEX
    assert "StriveRunPhotos.mount({client:sb,run:r,slot:$('run-photos'),owner," in INDEX
    assert '<a href="#run-photos">' in INDEX
    assert ">Reply</a>" in INDEX
    # A retired section used to land on Explore. Since a321b1b it lands on the Feed.
    assert "if(RETIRED.some(k=>q.has(k))){history.replaceState(null,'','/');return viewLanding();}" in INDEX
    assert "history.replaceState(null,'','/?explore')" not in INDEX
    assert "async function viewEvent()" in INDEX
    # Since migration 014 an event is a real page: the club's event, who is going, and Join.
    event = INDEX[INDEX.index("async function viewEvent()") : INDEX.index("const forum=")]
    assert "grinder_events" in event and "grinder_join_event" in event and "This event is not on __BRAND__" in event


def test_caption_and_output_are_bounded_by_database_constraints():
    assert "length(trim(caption)) between 1 and 280" in MIGRATION
    assert "length(output_url) <= 2048" in MIGRATION
    assert "https?" in MIGRATION
