"""The badge, the run map and the stride line, on every surface at once.

The badge and the headline are the run's own numbers and nothing else. The ghost run badge was
removed on 25 Sep 2026 (Oscar: a launch joke, not a product feature); a long unattended run now
earns the same badges as any other run. The map is the route through folders as station indices,
and the stride line is two lines of plain text to paste anywhere. The browser (site/feed-card.js)
and the local card (agentgrinder/feedcard.py) draw all three from one rule each, and the payload
that leaves a device for /l/ carries indices, never a folder name.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agentgrinder import feedcard, ingest  # noqa: E402

# A real overnight session on the author's machine, 20 Sep 2026, as the browser reader counts it:
# 1 typed turn, 270 tool calls, 12h 18m of moving time, started at 22:44 local. Numbers only.
LONG = {"id": "g", "title": "Night build", "harness": "Claude Code", "prompts": 1, "tool_calls": 270,
         "duration_s": 44330, "started_hour": 22, "rhythm": [1] + [0] * 23, "route": [0, 0, 1],
         "profiles": {"display_name": "Oscar"}}
DAY_ALONE = {"title": "Afternoon", "harness": "Cursor", "prompts": 2, "tool_calls": 112, "duration_s": 7354,
             "started_hour": 10, "ridge": [i % 5 for i in range(50)]}
DAY_RATIO = {"title": "Delegated", "harness": "Codex", "prompts": 4, "tool_calls": 174, "duration_s": 12495,
             "started_hour": 15}
OTHERS = [
    {"title": "short", "prompts": 1, "tool_calls": 200, "duration_s": 3599, "started_hour": 23},   # under an hour
    {"title": "idle", "prompts": 1, "tool_calls": 29, "duration_s": 7200, "started_hour": 23},     # too few calls
    {"title": "present", "prompts": 12, "tool_calls": 300, "duration_s": 7200, "started_hour": 14},  # 25 per turn by day
    {"title": "no time", "prompts": 1, "tool_calls": 300, "started_hour": 23},                     # no measured time
    {"title": "awake", "prompts": 12, "tool_calls": 30, "duration_s": 3600, "started_hour": 23},   # typed 12 times at night
]
UNKNOWN_TURNS_NIGHT = {"title": "hosted", "tool_calls": 90, "duration_s": 5400, "started_hour": 1}


def node(expr: str, *args) -> str:
    return subprocess.run(["node", "-e", expr, str(ROOT), *args], capture_output=True, text=True, check=True).stdout


def visible(markup: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", markup).split())


def test_no_ghost_badge_and_both_readers_agree():
    rows = [LONG, DAY_ALONE, DAY_RATIO, *OTHERS, UNKNOWN_TURNS_NIGHT]
    js = json.loads(node("const F=require(process.argv[1]+'/site/feed-card.js');process.stdout.write(JSON.stringify(JSON.parse(process.argv[2]).map(F.achievement)))", json.dumps(rows)))
    py = [feedcard.achievement(r) for r in rows]
    assert js == py
    assert all(a is None or a["key"] != "ghost" for a in py)
    assert not hasattr(feedcard, "ghost")
    assert "ghost" not in node("const F=require(process.argv[1]+'/site/feed-card.js');process.stdout.write(Object.keys(F).join(','))")
    # A 12-hour unattended run is a Marathon, stated by its measured time.
    assert py[0] == {"key": "marathon", "label": "Marathon", "detail": "12h 19m in one session"}
    assert py[1] == {"key": "delegator", "label": "Delegator", "detail": "56 tool calls per prompt"}
    for r in rows:
        card = feedcard.card(r)
        assert card.startswith('<article class="card fc">') and "ghost" not in card.lower() and "while you slept" not in card


def test_no_disclaimer_rides_on_the_card():
    text = visible(feedcard.card(LONG)).lower()
    for word in ("disclaimer", "estimated", "approximately", "may not", "not verified", "unverified", "beta"):
        assert word not in text


def test_the_map_is_drawn_from_indices_and_hidden_without_them():
    with_map = feedcard.card({**LONG, "route": [0, 1, 0, 2, 1, 3], "hero_visual": "change_atlas"})
    assert 'class="fc-map"' in with_map and with_map.count('class="fc-hop"') == 5 and with_map.count('class="fc-stn"') == 4
    assert "4 folders · 5 moves · 2 returns" in visible(with_map)
    # A row saved before the readers collapsed stays reads the same: [0, 0, 1] is one move, no return.
    assert "2 folders · 1 move · 0 returns" in visible(feedcard.card({**LONG, "route": [0, 0, 1], "hero_visual": "change_atlas"}))
    # A gap in the numbering names no phantom station: [0, 5, 0] is two folders and one return.
    assert "2 folders · 2 moves · 1 return" in visible(feedcard.card({**LONG, "route": [0, 5, 0], "hero_visual": "change_atlas"}))
    for route in (None, [], [0], [0, 0, 0], [0, "site"], [0, 16], [-1, 0]):
        assert 'class="fc-map"' not in feedcard.card({**LONG, "route": route}), route
    # The browser draws the same map, character for character.
    js = node("const F=require(process.argv[1]+'/site/feed-card.js');process.stdout.write(F.routeMap(JSON.parse(process.argv[2])))",
              json.dumps({**LONG, "route": [0, 1, 0, 2, 1, 3, 3, 0]}))
    assert js == feedcard.route_map({**LONG, "route": [0, 1, 0, 2, 1, 3, 3, 0]})


def test_the_route_never_carries_a_folder_name(tmp_path):
    session = tmp_path / "s.jsonl"
    lines = [
        {"type": "user", "timestamp": "2026-09-20T22:50:00Z", "cwd": "/Users/alice/SECRET-PROJECT", "promptSource": "typed",
         "message": {"role": "user", "content": "PROMPT-TEXT"}},
        {"type": "assistant", "timestamp": "2026-09-20T22:50:20Z", "message": {"role": "assistant", "content": [
            {"type": "tool_use", "name": "Read", "input": {"file_path": "/Users/alice/SECRET-PROJECT/site/a.js"}},
            {"type": "tool_use", "name": "Edit", "input": {"file_path": "/Users/alice/SECRET-PROJECT/tests/t.py"}},
            {"type": "tool_use", "name": "Edit", "input": {"file_path": "/Users/alice/SECRET-PROJECT/tests/u.py"}},
            {"type": "tool_use", "name": "Write", "input": {"file_path": "/Users/alice/SECRET-PROJECT/site/b.js"}}]}},
        {"type": "user", "timestamp": "2026-09-20T23:50:00Z", "promptSource": "typed", "message": {"role": "user", "content": "again"}},
    ]
    session.write_text("\n".join(json.dumps(x) for x in lines))
    run = ingest.parse_session(str(session))
    assert run["route"] == [0, 1, 0]                       # site, tests, back to site: two stays in tests are one
    assert run["route_legend"] == ["site", "tests"]        # names stay local (hook.py drops them)
    public = {k: v for k, v in run.items() if k != "route_legend"}
    assert "SECRET-PROJECT" not in json.dumps(public.get("route")) and all(isinstance(v, int) for v in run["route"])
    # The browser payload for the same file: indices, and nothing that names the folder.
    payload = node("const D=require(process.argv[1]+'/site/dropin-parse.js');const r=D.parseText(require('fs').readFileSync(process.argv[2],'utf8'));process.stdout.write(JSON.stringify(D.uploadPayload(r,'t')))", str(session))
    assert json.loads(payload)["route"] == [0, 1, 0]
    for probe in ("SECRET", "alice", "site", "tests", "/Users", "PROMPT-TEXT", "a.js"):
        assert probe not in payload, probe


def test_the_route_caps_stations_and_moves():
    paths = [f"/r/f{i % 20}/x.py" for i in range(1000)]
    route, names = ingest.folder_route(paths)
    assert max(route) == 15 and len(route) <= 400 and len(names) == 16
    js = json.loads(node("const D=require(process.argv[1]+'/site/dropin-parse.js');process.stdout.write(JSON.stringify(D.folderRoute(JSON.parse(process.argv[2]))))", json.dumps(paths)))
    assert js == route
    # The payload sends the route as read or not at all: nothing is clamped into range.
    for bad in ([0, 16], [0, "site"], [1.5], list(range(401))):
        sent = json.loads(node("const D=require(process.argv[1]+'/site/dropin-parse.js');process.stdout.write(JSON.stringify(D.uploadPayload({harness:'Codex',rhythm:[1],route:JSON.parse(process.argv[2])},'t').route))", json.dumps(bad)))
        assert sent is None, bad


def test_the_stride_line_is_the_card_in_two_lines_and_pastes_the_same_from_both_readers():
    rows = [LONG, DAY_ALONE, {"title": "t", "harness": "Cursor", "tool_calls": 98, "prompts": 1, "duration_s": 1080,
                               "started_hour": 23, "rhythm": [2, 7, 1, 3, 2, 1, 2, 1, 3, 2, 1, 2]}]
    url = "https://agentic-strava.vercel.app/l/k7f2"
    js = json.loads(node("const F=require(process.argv[1]+'/site/feed-card.js');process.stdout.write(JSON.stringify(JSON.parse(process.argv[2]).map(r=>F.strideText(r,process.argv[3]))))", json.dumps(rows), url))
    py = [feedcard.stride_text(r, url) for r in rows]
    assert js == py
    first, second = py[0].split("\n")
    assert first == "STRIVE · Night build"
    assert py[1].startswith("STRIVE · Afternoon\n")
    assert second.endswith("  agentic-strava.vercel.app/l/k7f2") and re.fullmatch(r"[▁▂▃▄▅▆▇█]{2,12}", second.split("  ")[0])
    assert py[2].startswith("STRIVE · t\n")
    # The share line uses the chosen title and story, not a duration award.
    assert "PROMPT" not in py[0] and "/" not in first
    # The standalone share line remains available; Bean's story-first feed omits it.
    assert '<div class="fc-stride"><pre>' in feedcard.stride(LONG)
    assert "fc-stride" not in feedcard.card(LONG) and "fc-copy" not in feedcard.card(LONG)
    web = node("const F=require(process.argv[1]+'/site/feed-card.js');process.stdout.write(F.card(JSON.parse(process.argv[2]),{preview:true,copy:true,url:process.argv[3]}))", json.dumps(LONG), url)
    assert "fc-copy" not in web
    # And the terminal prints the same two lines.
    lines = feedcard.terminal_lines(LONG)
    assert lines[-2].strip() == first and lines[-1].strip() == second.split("  ")[0]


def test_orange_is_spent_on_two_marks_only():
    css = (ROOT / "site/feed.css").read_text()
    rules = [line for line in css.splitlines() if "--strive-orange" in line and not line.startswith(":root")]
    selectors = sorted(rule.split("{")[0].strip() for rule in rules)
    # The peak is one mark drawn twice: the dot on the activity line and the tallest bar of the
    # stride line. One rule colours both, so it stays one of the two.
    assert selectors == [".fc-act.kudo.on,.fc-act.kudo.on svg", ".fc-peak,.fc-bars b"]
    assert "#fc4c02" not in css.lower().replace(":root{--strive-orange:#fc4c02}", "")
    # The map is blue: none of its classes name the orange.
    for cls in (".fc-rail", ".fc-hop", ".fc-stn"):
        rule = next(line for line in css.splitlines() if line.startswith(cls))
        assert "orange" not in rule


def test_the_landing_and_the_share_image_carry_the_line():
    html = (ROOT / "site/index.html").read_text()
    assert "Strava is for people who ran. <i>__BRAND__</i> is for people who didn't." in html
    assert html.count("Strava is for people who ran. __BRAND__ is for people who didn't.") == 2   # og + twitter
    server = (ROOT / "server/public-run.mjs").read_text()
    assert "Strava is for people who ran. ${BRAND} is for people who didn't." in server
    # The share image draws the map from the same geometry as the card, and no ghost badge.
    assert "Feed.routeGeometry(run)" in server and "ghost" not in server.lower()
    # `route` is the map, and never a second line on the image.
    assert "'Project ridge'" not in server


def test_a_subagent_capture_reads_claude_code_on_every_surface():
    row = {"title": "", "harness": "claude-agent", "started": "2026-09-25T02:00:00Z", "tool_calls": 40, "prompts": 1, "duration_s": 600}
    card = feedcard.card(row)
    assert "claude-agent" not in card and "Claude Code" in visible(card)
    assert feedcard.stride_text(row).startswith("STRIVE · Claude Code session, ")
    assert row["harness"] == "claude-agent"                  # the row keeps the raw value
    js = node("const F=require(process.argv[1]+'/site/feed-card.js');process.stdout.write(F.card(JSON.parse(process.argv[2]),{preview:true,heading:'h1'}))", json.dumps(row))
    assert js == feedcard.card(row, avatars=True)


def test_codex_desktop_rollouts_count_the_prompts_the_person_typed():
    # A 29 Jul 2026 desktop rollout on the author's machine read as 0 typed prompts, which would
    # have fed the badges a false number. The typed turns there are user-role messages.
    run = ingest.parse_codex_session(str(ROOT / "samples/dropin/codex-desktop.jsonl"))
    assert run["turns_typed"] == 2 and run["tool_calls"] == 2 and run["route"] == [0, 1]
    assert "PROMPT-SENTINEL" not in json.dumps({k: v for k, v in run.items() if k not in ("title", "private_title_prompt")})
    with_events = ingest.parse_codex_session(str(ROOT / "samples/dropin/codex-edge.jsonl"))
    assert with_events["turns_typed"] >= 1                   # the event form still reads as before


def test_copy_reads_the_stride_at_the_click_so_the_link_is_on_it():
    # The drop-in wires Copy before a link exists and rewrites data-copy once it does. A handler
    # that read the text at wiring time copied the line without the address.
    out = node("""const {JSDOM}=require(process.argv[1]+'/node_modules/jsdom');
const dom=new JSDOM('<button class="fc-copy" data-copy="A">Copy</button>');
global.window=dom.window;global.document=dom.window.document;
const F=require(process.argv[1]+'/site/feed-card.js');
const got=[];Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async t=>{got.push(t)}},share:d=>{got.push('share:'+d.text);return Promise.resolve()}},configurable:true});
F.wireStride(document);const b=document.querySelector('.fc-copy');b.dataset.copy='B';
b.click();document.querySelector('.fc-share').click();
setTimeout(()=>process.stdout.write(JSON.stringify(got)),20);""")
    assert json.loads(out) == ["B", "share:B"]


def test_a_long_run_leads_with_its_strongest_measured_number():
    lead = feedcard.headline(LONG)
    assert (lead["n"], lead["unit"]) == ("270", "tool calls")
    assert [k for k, _ in feedcard.stats(LONG, lead)] == ["Time", "Turns"]
    assert feedcard.headline({**DAY_RATIO, "commits": 3, "files_touched": 9})["unit"] == "commits"
    assert feedcard.headline({"commits": 2, "files_touched": 5, "tool_calls": 40, "duration_s": 5400, "prompts": 12})["unit"] == "commits"
    js = json.loads(node("const F=require(process.argv[1]+'/site/feed-card.js');process.stdout.write(JSON.stringify(JSON.parse(process.argv[2]).map(r=>{const l=F.headline(r);return [l,F.stats(r,l)]})))",
                         json.dumps([LONG, DAY_ALONE, DAY_RATIO, *OTHERS])))
    py = [[feedcard.headline(r), [list(f) for f in feedcard.stats(r, feedcard.headline(r))]] for r in [LONG, DAY_ALONE, DAY_RATIO, *OTHERS]]
    assert js == py


def test_the_stride_bars_are_monospace_with_the_peak_marked_and_copy_plain():
    row = {**LONG, "rhythm": [2, 7, 1, 3, 2, 1, 2, 1, 3, 2, 1, 2]}
    html = feedcard.stride_html(row, "https://agentic-strava.vercel.app/l/k7f2")
    bars = re.search(r'<span class="fc-bars">(.*?)</span>', html).group(1)
    assert bars.count("<b>") == 1 and re.sub(r"</?b>", "", bars) == feedcard.stride_bars(row)
    assert re.search(r"<b>(.)</b>", bars).group(1) == "█"
    # What is copied is the plain text; the markup is only on the card.
    web = node("const F=require(process.argv[1]+'/site/feed-card.js');process.stdout.write(F.stride(JSON.parse(process.argv[2]),{copy:true,url:process.argv[3]}))",
               json.dumps(row), "https://agentic-strava.vercel.app/l/k7f2")
    copied = re.search(r'data-copy="([^"]*)"', web).group(1)
    assert "<" not in copied and "&lt;" not in copied and feedcard.stride_bars(row) in copied
    js = node("const F=require(process.argv[1]+'/site/feed-card.js');process.stdout.write(F.strideHtml(JSON.parse(process.argv[2]),process.argv[3]))",
              json.dumps(row), "https://agentic-strava.vercel.app/l/k7f2")
    assert js == html
    css = (ROOT / "site/feed.css").read_text()
    assert "monospace" in next(line for line in css.splitlines() if line.startswith(".fc-bars{"))


def test_a_two_folder_map_is_a_short_strip():
    small = feedcard.route_geometry({"route": [0, 1, 0]})
    full = feedcard.route_geometry({"route": [0, 1, 2]})
    assert small["h"] < full["h"] and 'viewBox="0 0 300 26"' in feedcard.route_map({"route": [0, 1, 0]})
    for route in ([0, 1, 0, 1, 0], [0, 1, 2, 0]):
        js = node("const F=require(process.argv[1]+'/site/feed-card.js');process.stdout.write(F.routeMap(JSON.parse(process.argv[2])))", json.dumps({"route": route}))
        assert js == feedcard.route_map({"route": route})
