"""The drop-in: a session file read in the browser, a card, an unlisted link.

The heavy checks are Node scripts (npm run test:dropin): parity of the browser reader with
ingest.py, the payload and rate limits through the real handler, and migration 011 in PGlite.
These are the fast guards that sit with the Python suite.
"""
import json
import re
import subprocess
from pathlib import Path

from agentgrinder import feedcard

ROOT = Path(__file__).resolve().parents[1]
READER = (ROOT / "site/dropin-parse.js").read_text()
UI = (ROOT / "site/dropin.js").read_text()

ROWS = [
    {"duration_s": 10800, "turns_typed": 5, "tool_calls": 40},                  # marathon
    {"duration_s": 600, "prompts": 1, "tool_calls": 60},                        # one-shot
    {"duration_s": 600, "prompts": 3, "tool_calls": 9, "started_hour": 23},     # night owl
    {"duration_s": 600, "prompts": 3, "tool_calls": 9, "started_hour": 4},      # night owl, early
    {"prompts": 4, "tool_calls": 9, "commits": 5},                              # shipper
    {"prompts": 4, "tool_calls": 9, "files_touched": 25},                       # wide net
    {"prompts": 2, "tool_calls": 61},                                           # delegator, rounds 30.5 up
    {"duration_s": 899, "prompts": 2, "tool_calls": 3, "commits": 1},           # sprint
    {"wall_time_s": 3600, "prompts": 2, "tool_calls": 3},                       # deep focus
    {"prompts": 2, "tool_calls": 3, "started_hour": 6},                         # early bird
    {"prompts": 2, "tool_calls": 3, "started_hour": 12, "duration_s": 60},      # nothing earned
    {"prompts": 1, "tool_calls": 59},                                           # one short of one-shot
    {"started_hour": True, "prompts": 2, "tool_calls": 3},                      # a boolean is not an hour
    {"tool_calls": 0, "ridge": [1] * 50, "ridge_tool_calls": 70, "prompts": 1}, # counts through the ridge
]


def test_the_badge_is_the_same_in_the_browser_and_on_the_local_card():
    js = subprocess.run(["node", "-e", "const F=require(process.argv[1]);process.stdout.write(JSON.stringify(JSON.parse(process.argv[2]).map(F.achievement)))",
                         str(ROOT / "site/feed-card.js"), json.dumps(ROWS)], capture_output=True, text=True, check=True).stdout
    assert json.loads(js) == [feedcard.achievement(r) for r in ROWS]
    keys = [a and a["key"] for a in json.loads(js)]
    assert keys == ["marathon", "one-shot", "night-owl", "night-owl", "shipper", "wide-net", "delegator",
                    "sprint", "deep-focus", "early-bird", None, None, None, "one-shot"]


def test_every_badge_prints_the_number_that_earned_it():
    assert feedcard.achievement(ROWS[1])["detail"] == "1 prompt, 60 tool calls"
    assert feedcard.achievement(ROWS[6])["detail"] == "31 tool calls per prompt"
    assert feedcard.achievement({"duration_s": 11000})["detail"] == "3h 3m in one session"


def test_the_reader_makes_no_request():
    # The page says nothing leaves the device while the file is read. The reader has no way to send.
    for call in ("fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "import(", "navigator."):
        assert call not in READER, call
    # The page's one send is the link request, with the allowlisted payload only.
    assert UI.count("fetch(") == 1 and 'fetch("/api/link"' in UI
    assert "GrinderDropin.uploadPayload(run, titleText())" in UI


def test_the_upload_allowlist_matches_the_database_allowlist():
    js = re.search(r"const UPLOAD_KEYS = \[(.*?)\]", READER).group(1)
    # 012 defines the base allowlist; 051 wraps it with validated prompt provenance.
    sql = re.search(r"allowed constant text\[\] := array\[(.*?)\];", (ROOT / "supabase/strava/012_dropin_route.sql").read_text(), re.S).group(1)
    words = lambda s: sorted(re.findall(r"'([a-z_]+)'|\"([a-z_]+)\"", s))
    expected = [w[0] or w[1] for w in words(sql)] + ["prompt_provenance"]
    assert sorted(w[0] or w[1] for w in words(js)) == sorted(expected)


def test_migration_011_only_creates():
    sql = (ROOT / "supabase/strava/011_dropin_links.sql").read_text() + (ROOT / "supabase/strava/012_dropin_route.sql").read_text()
    body = re.sub(r"--[^\n]*", "", sql)
    assert not re.search(r"\balter\s+table\s+strava\.(?!dropin_)", body, re.I)
    assert not re.search(r"\bdrop\s+(table|policy|function|trigger|column)\b", body, re.I)
    assert not re.search(r"\bcreate\s+(or\s+replace\s+)?policy\b", body, re.I)
    assert not re.search(r"\bgrant\s+[^;]*\bon\s+(table\s+)?strava\.(?!dropin_)", body, re.I)


def test_a_phone_is_sent_to_the_laptop_and_the_mac_paths_fold():
    # Slice 4 (25 Sep 2026). The session file lives on the computer the agent ran on, so on a
    # phone the one primary action sends this page there. Choose a file stays, as the secondary.
    phone = UI[UI.index("function isPhone()"):UI.index("function mount(options)")]
    assert '"(pointer: coarse)"' in phone and '"(hover: none)"' in phone and '!m("(any-pointer: fine)")' in phone
    # The paths are on Add a run / Connect, one per agent, since the home became the feed. Since
    # b803b86 the page hands them, and the drop zone, to the post flow (site/post-flow.js).
    html = (ROOT / "site/index.html").read_text()
    connect = html[html.index("function connectBodyHtml(){"):html.index("function wireConnectCopies(")]
    assert "dropHtml:dropZoneHtml()" in connect and "agentFiles:AGENT_FILES" in connect
    # Draw that page with the shipped modules and mount the drop-in on a phone and on a laptop.
    script = r"""
const fs=require('fs'),vm=require('vm'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('site/index.html','utf8');
const cut=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));
const page=vm.runInNewContext(cut('function dropZoneHtml(){','// The newest public runs')+';({drop:dropZoneHtml(),files:AGENT_FILES})');
const draw=async phone=>{
 const w=new JSDOM('<title>Add a run</title><main id="app"></main>',{url:'https://strive.test/?post',runScripts:'outside-only'}).window;
 w.matchMedia=q=>({matches:phone?(q==='(pointer: coarse)'||q==='(hover: none)'):q==='(any-pointer: fine)'});
 const shared=[],copied=[];
 Object.defineProperty(w.navigator,'share',{value:async data=>{shared.push(data)},configurable:true});
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied.push(text)}},configurable:true});
 for(const file of ['post-flow','dropin-parse','dropin'])w.eval(fs.readFileSync('site/'+file+'.js','utf8'));
 const d=w.document;
 d.getElementById('app').innerHTML=w.StrivePostFlow.setupHtml({agentPrompt:'',capture:'',syncHtml:'',dropHtml:page.drop,agentFiles:page.files,agentCommands:{}});
 w.GrinderDropinUI.mount({privateFirst:true});
 const fold=d.querySelector('details.post-file-entry'),send=d.getElementById('drop-send'),choose=d.getElementById('select-export');
 const seen={send:send&&{text:send.textContent,primary:send.classList.contains('primary'),afterZone:send.parentElement.previousElementSibling===d.getElementById('drop-zone')},
  choosePrimary:choose.classList.contains('primary'),chooseText:choose.textContent,fileInput:!!d.getElementById('drop-file'),
  foldOpen:fold.open,foldHoldsZone:fold.contains(d.getElementById('drop-zone')),
  folders:[...fold.querySelectorAll('.post-source-folders code')].map(c=>c.textContent)};
 if(send){send.click();await new Promise(r=>setTimeout(r,0));
  // No share sheet (a desktop browser on a touch screen): the address is copied instead.
  Object.defineProperty(w.navigator,'share',{value:undefined,configurable:true});
  send.click();await new Promise(r=>setTimeout(r,0));seen.afterCopy=send.textContent;}
 Object.assign(seen,{shared,copied});w.close();return seen;};
(async()=>process.stdout.write(JSON.stringify({phone:await draw(true),laptop:await draw(false)})))().catch(e=>{console.error(e);process.exit(1)});
"""
    seen = json.loads(subprocess.check_output(["node", "-e", script], cwd=ROOT, text=True))
    phone_page, laptop = seen["phone"], seen["laptop"]
    # On a phone: one primary action, right after the zone, and Choose a file is demoted.
    assert phone_page["send"] == {"text": "Send this link to your laptop", "primary": True, "afterZone": True}
    assert phone_page["choosePrimary"] is False and phone_page["chooseText"] == "Choose session file"
    assert phone_page["fileInput"] is True
    # The share sends the page address and nothing from any file.
    assert phone_page["shared"] == [{"title": "Add a run", "url": "https://strive.test/?post"}]
    assert phone_page["copied"] == ["https://strive.test/?post"] and phone_page["afterCopy"] == "Link copied"
    # On a laptop nothing is sent anywhere and Choose a file is the primary action.
    assert laptop["send"] is None and laptop["choosePrimary"] is True
    assert laptop["shared"] == [] and laptop["copied"] == []
    # The paths, one per agent, sit folded with the zone until asked for, on both. The landing's
    # own fold (details.drop-where, which a phone closed) has not been drawn since d79fb3f.
    for page in (phone_page, laptop):
        assert page["foldOpen"] is False and page["foldHoldsZone"] is True
        assert page["folders"] == ["~/.claude/projects/", "~/.cursor/projects/", "~/.codex/sessions/", "bb thread log --self --all --json > bb-session.json"]
    send = phone[phone.index("async function sendToLaptop"):phone.index("function phoneStage")]
    # The page the person is on, so Connect sends Connect and the landing sends the landing.
    assert 'const url = location.href;' in send and "run" not in send.replace("return", "")
