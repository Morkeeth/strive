"""The headline is verified-per-turn, prompts are a cost. Math + the v0 claim rule.

Written 2026-09-02 after the metric finding (METRICS-AGENTIC-ENGINEERING-2026-09-02, an internal spec not in this repo):
a card that headlines "47 prompts" celebrates the METR failure. These tests pin the flip.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agentgrinder.claims import ClaimTracker, claims_in, evidence_matches
from agentgrinder.ingest import parse_session
from agentgrinder.metrics import build_activity, verified_per_turn
from agentgrinder.render import render_card


def test_headline_math():
    assert verified_per_turn(6, 4, 47) == (6 + 4) / 47
    assert abs(verified_per_turn(6, 4, 47) - 0.2127659) < 1e-6


def test_headline_never_fabricated_from_missing_parts():
    # a missing numerator defaulted to 0 would print a low score nobody measured
    assert verified_per_turn(None, 4, 47) is None
    assert verified_per_turn(6, None, 47) is None
    assert verified_per_turn(6, 4, None) is None
    assert verified_per_turn(6, 4, 0) is None


def test_activity_headline_and_five_row():
    run = {"turns_typed": 47, "duration_s": 8400, "claims": 9, "claims_verified": 6,
           "artifacts_produced": 4, "artifacts_promised": None, "corrections": None, "reach": None}
    a = build_activity(run)
    assert a.headline == "0.21"
    assert a.headline_formula == "(6 verified + 4 artifacts) ÷ 47 typed turns"
    labels = [c.label for c in a.five]
    assert labels == ["typed turns", "verified claims", "correction rate", "produced ÷ promised", "reach"]
    typed, share, corr, prod, reach = a.five
    assert typed.value == "47" and typed.cost is True          # prompts are the cost
    assert share.value == "6/9 · 67%"
    # 3 Sep: a dash used to name a private project of the author's ("Transcripto", "repo E",
    # "Helicon"), which reads to a stranger as "this will never work for you". A dash now names
    # THE MISSING FACT and says whether the reader can supply it today.
    assert corr.value == "—" and corr.source.startswith("not measured yet")
    assert "no harness records that" in corr.source
    assert prod.value == "4 ÷ —" and "Promised is not measured yet" in prod.source
    assert reach.value == "—" and "cross to a person who is not the author" in reach.source
    for cell in a.five:
        for private in ("Transcripto", "repo E", "Helicon"):
            assert private not in cell.source, cell.label
    # the Strava-shaped numbers survive, under cost
    assert a.distance == "47 prompts"


def test_activity_with_no_five_numbers_prints_dashes():
    a = build_activity({"turns_typed": 12, "duration_s": 600})
    assert a.headline == "—"
    assert "verified claims" in a.headline_formula
    assert [c.value for c in a.five] == ["12", "—", "—", "— ÷ —", "—"]


def test_no_surface_points_a_stranger_at_a_project_only_the_author_can_run():
    """The headline tooltip named a witness log by a private project's name on two surfaces the
    terminal card does not use (the grind card and the profile), so the card test above missed
    it. The rule is per SENTENCE, not per surface."""
    from agentgrinder.metrics import HEADLINE_TIP, SOURCES
    for text in [HEADLINE_TIP, *SOURCES.values()]:
        for private in ("Transcripto", "repo E", "Helicon"):
            assert private not in text, text


def test_card_never_headlines_prompts():
    """The local card is the feed card. Since d442d80 (5 Oct 2026) it carries no metric hero: the
    title leads and no count sits above it, so the prompt count cannot be the headline. The run's
    leading figure is still the strongest count it measured (commits, files, tool calls, time),
    read by the same rule from the same row, and printed first on the command line; prompts are
    a small figure after it. Verified per turn stays the terminal's and the return view's headline
    (headline_of)."""
    from agentgrinder import feedcard
    run = json.load(open(os.path.join(os.path.dirname(__file__), "..", "samples", "sample_run.json")))
    activity = build_activity(run)
    html = render_card(activity)
    article = html[html.index('<article class="card fc">'):html.index("</article>")]
    assert not re.search(r'class="fc-(?:hero|numbers|n|u|stats)[ "]', article)
    assert re.search(r'<h1 class="fc-title">(.*?)</h1>', article).group(1) == "sample-project: a two-hour probe"
    assert "prompt" not in re.sub(r"<[^>]+>", " ", article).lower() and "47" not in re.sub(r"<[^>]+>", " ", article)
    lead = feedcard.headline(activity.card_row)
    assert lead == {"n": "3", "unit": "commits", "key": "commits"} and "prompt" not in lead["unit"]
    assert feedcard.stats(activity.card_row, lead) == [("Time", "2h 20m"), ("Turns", 47), ("Tool calls", "213")]
    assert feedcard.terminal_lines(activity.card_row)[2] == "\n  3 commits · Time 2h 20m · Turns 47 · Tool calls 213"
    # A run that measured nothing but its prompts still gets no prompt headline.
    assert feedcard.headline({"prompts": 47, "turns_typed": 47}) is None
    assert ">Distance<" not in html
# ---- the claim rule (calibrated 3 Sep 2026, see tests/test_claim_rule.py) --------------

def test_claim_lines_and_tokens():
    # "Ran the suite." is a claim the v0 vocabulary regex could not see: it names no completion
    # word at all. The calibrated rule reads it as one, and still ignores the line that asserts
    # nothing. The tokens come from the claim line, and only from it.
    cl = claims_in("Ran the suite.\ntests/test_x.py passes — test_alpha green\nno claim here\n")
    assert [c.line for c in cl] == ["Ran the suite.", "tests/test_x.py passes — test_alpha green"]
    assert "test_alpha" in cl[1].tokens and "tests/test_x.py" in cl[1].tokens
    assert cl[0].tokens == set()


def test_evidence_generic_token_rejected_when_result_also_fails():
    c = claims_in("all tests pass, done")[0]
    assert evidence_matches(c, "3 passed in 0.1s")
    assert not evidence_matches(c, "2 passed, 1 failed")
    assert not evidence_matches(c, "some listing with nothing")


def test_tracker_window_is_the_human_turn_either_side():
    t = ClaimTracker()
    t.typed_turn()
    t.tool_result("4 passed in 0.2s")           # evidence BEFORE the claim (the common shape)
    t.assistant_text("tests pass, fixed.")
    t.typed_turn()                              # new human turn: the next claim cannot borrow that evidence
    t.assistant_text("deployed and works")
    t.close()
    assert (t.claims, t.verified) == (2, 1)


def _rec(typ, content, **kw):
    o = {"type": typ, "timestamp": kw.pop("ts", "2026-09-02T10:00:00Z"), "message": {"role": typ, "content": content}}
    o.update(kw)
    return o


def test_parse_session_counts_claims_and_produced(tmp_path):
    made = tmp_path / "out.md"; made.write_text("x")
    lines = [
        _rec("user", "please fix it", ts="2026-09-02T10:00:00Z", cwd=str(tmp_path), promptSource="typed"),
        _rec("assistant", [{"type": "tool_use", "name": "Write", "input": {"file_path": str(made)}},
                           {"type": "tool_use", "name": "Write", "input": {"file_path": str(tmp_path / "never.md")}}],
             ts="2026-09-02T10:00:10Z"),
        _rec("user", [{"type": "tool_result", "content": "5 passed in 0.3s"}], ts="2026-09-02T10:00:20Z"),
        _rec("assistant", [{"type": "text", "text": "Suite passes. Also the deploy is done."}], ts="2026-09-02T10:00:30Z"),
        _rec("user", "thanks, now the other thing", ts="2026-09-02T10:05:00Z", promptSource="typed"),
        _rec("assistant", [{"type": "text", "text": "Fixed it."}], ts="2026-09-02T10:05:10Z"),
    ]
    p = tmp_path / "s.jsonl"
    p.write_text("\n".join(json.dumps(x) for x in lines) + "\n")
    r = parse_session(str(p))
    assert r["turns_typed"] == 2
    # The compound line also promises a deploy. Passing tests do not prove that claim.
    assert (r["claims"], r["claims_verified"]) == (2, 0)
    assert r["artifacts_produced"] == 1                    # never.md was not written to disk
    assert r["artifacts_promised"] is None and r["corrections"] is None and r["reach"] is None
    a = build_activity(r)
    assert a.headline == f"{(0 + 1) / 2:.2f}"


# ---- 3 Sep: the other three surfaces never headline prompts either -----------------------------
# The demo card flipped on 2 Sep; `grind` (solocard.py), the web app (site/index.html) and the
# profile (profile.py / render_profile) still put the prompt count first. These pin the flip on
# each, with the same predicate: the first big number is verified per turn (or a dash that names
# what is missing), and the word "Prompts" only appears under COST.

import re

from agentgrinder.profile import totals_of
from agentgrinder.render import render_profile
from agentgrinder.solo import parse_solo
from agentgrinder.solocard import headline, render_solo_card

REPO = os.path.join(os.path.dirname(__file__), "..")


def _solo_jsonl(tmp_path):
    """A two-turn sitting in a directory with no git work tree: one Write that lands on disk,
    one claim with a passing result in its turn, one claim with none."""
    made = tmp_path / "out.md"; made.write_text("x")
    cwd = str(tmp_path)
    lines = [
        _rec("user", "please fix it", ts="2026-09-03T10:00:00Z", cwd=cwd, promptSource="typed"),
        _rec("assistant", [{"type": "tool_use", "name": "Write", "input": {"file_path": str(made)}}],
             ts="2026-09-03T10:00:10Z", cwd=cwd),
        _rec("user", [{"type": "tool_result", "content": "3 passed in 0.2s"}], ts="2026-09-03T10:00:20Z", cwd=cwd),
        _rec("assistant", [{"type": "text", "text": "Suite passes, fixed."}], ts="2026-09-03T10:00:30Z", cwd=cwd),
        _rec("user", "and the other thing", ts="2026-09-03T10:04:00Z", cwd=cwd, promptSource="typed"),
        _rec("assistant", [{"type": "tool_use", "name": "Read", "input": {"file_path": str(made)}}],
             ts="2026-09-03T10:04:10Z", cwd=cwd),
        _rec("assistant", [{"type": "text", "text": "Done."}], ts="2026-09-03T10:05:00Z", cwd=cwd),
    ]
    p = tmp_path / "s.jsonl"
    p.write_text("\n".join(json.dumps(x) for x in lines) + "\n")
    return str(p)


def test_grind_card_never_headlines_prompts(tmp_path):
    run = parse_solo(_solo_jsonl(tmp_path), athlete="t")
    # the five parts travel in the run dict as counts, same window as everything else
    assert run["turns_typed"] == 2
    assert (run["claims"], run["claims_verified"]) == (2, 1)
    assert run["artifacts_produced"] == 1
    assert run["corrections"] is None and run["artifacts_promised"] is None and run["reach"] is None

    from agentgrinder import feedcard
    from agentgrinder.solocard import card_row
    html = render_solo_card(run)
    # The grind card is the feed card: no metric hero since d442d80, so no prompt count on top.
    article = html[html.index('<article class="card fc">'):html.index("</article>")]
    assert not re.search(r'class="fc-(?:hero|numbers|n|u|stats)[ "]', article)
    assert "prompt" not in re.sub(r"<[^>]+>", " ", article).lower()
    # The same row on the command line: the measured count leads, typed turns are a small figure.
    row = card_row(run)
    lead = feedcard.headline(row)
    assert lead == {"n": "1", "unit": "file changed", "key": "files"} and "prompt" not in lead["unit"]
    assert feedcard.stats(row, lead) == [("Time", "5m"), ("Turns", 2), ("Tool calls", "2")]
    assert feedcard.terminal_lines(row)[2] == "\n  1 file changed · Time 5m · Turns 2 · Tool calls 2"
    # Under the card, the outcome is the lead line and the prompts follow it as its cost.
    below = html[html.index("</article>"):]
    assert below.index('<p class="lead">1 file changed in ') < below.index("<p>From <b>2</b> typed prompts in <b>5</b> minutes.</p>")
    # the h1 (the largest text on the card) does not open with the prompt count either
    h1 = re.search(r'<h1 class="fc-title">(.*?)<', html).group(1)
    assert not re.match(r"\d+ prompts?\b", h1), h1
def test_grind_headline_ladder_fallbacks_lead_with_the_outcome():
    base = dict(stretch=None, project="p", turns_typed=12, started="2026-09-03T10:00:00",
                ended="2026-09-03T10:30:00", ship_states={"never": 0}, tool_calls=20,
                files_edited=0, files_touched=0, commits=0)
    assert headline({**base, "commits": 3})[0] == "3 commits landed on p"
    assert headline({**base, "files_edited": 2, "files_touched": 2})[0] == "2 files changed in p, no commit yet"
    assert headline({**base, "files_touched": 4})[0].startswith("A reading grind")
    assert not headline(base)[0].startswith("12 prompts")
    for k in ("commits", "files_edited", "files_touched"):
        assert not re.match(r"\d+ prompts?\b(?! →)", headline({**base, k: 3})[0])


def test_grind_card_with_no_claim_counts_prints_no_dash_and_no_zero(tmp_path):
    # an older `--json` dump has no claims_verified: nothing about claims is drawn, nothing invented
    run = parse_solo(_solo_jsonl(tmp_path), athlete="t")
    for k in ("claims", "claims_verified", "artifacts_produced"):
        run.pop(k)
    html = render_solo_card(run)
    card = re.sub(r"<[^>]+>", " ", html.split('<article class="card fc">')[1].split("</article>")[0])
    assert "—" not in card and "0.00" not in card and "Unknown" not in card
WEB_CARD = r"""
const fs=require('fs'),vm=require('vm'),{JSDOM}=require('jsdom');
const s=fs.readFileSync('site/index.html','utf8');
const cut=(from,to)=>s.slice(s.indexOf(from),s.indexOf(to,s.indexOf(from)));
const ctx={URL,Date,ME:null,GrinderContract:require('./site/run-contract.js'),GrinderFeed:require('./site/feed-card.js'),
 StriveActivity:require('./site/activity-order.js'),StriveContext:require('./site/run-context.js'),StriveEvidence:require('./site/run-evidence.js'),
 StriveHistory:require('./site/historical-import.js'),StrivePost:require('./site/activity-post.js'),StriveLinks:require('./site/run-links.js'),
 StriveStory:require('./site/run-story.js'),
 esc:v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])),
 runAttribution:()=>({handle:'sample',name:'sample',link:null,ghost:false}),avatar:()=>'',coachModeBanner:()=>''};
vm.createContext(ctx);
// The real card, with the real ratio rule and the real measurement rows it draws in its details.
vm.runInContext(cut('const VPT_TIP=','const pace=')+cut('function coachBlock(r){','// A repository link is an https address')+
 cut('function connectWrapperName(','function wireKudos(')+';this.runCard=runCard;this.vpt=vpt;this.vptText=vptText;this.fiveRow=fiveRow;',ctx);
const [full,partial]=JSON.parse(process.argv[1]);
const facts=run=>{
 const markup=ctx.runCard(run,false,0),at=markup.indexOf('<details class="ridge-more run-explore"');
 const face=new JSDOM(markup.slice(0,at)).window.document,explore=new JSDOM(markup.slice(at)).window.document;
 const text=n=>n?n.textContent.replace(/\s+/g,' ').trim():null;
 return {markup,order:['<div class="title">','<dl class="run-metrics"','<p class="post-no-trace">','<details class="ridge-more run-explore"'].map(k=>markup.indexOf(k)),
  title:text(face.querySelector('.title')),strip:[...face.querySelectorAll('dl.run-metrics .run-metric')].map(m=>[text(m.querySelector('dt')),text(m.querySelector('dd'))]),
  faceText:text(face.body),summary:text(explore.querySelector('details.run-explore > summary')),
  measured:[...explore.querySelectorAll('.run-measurements > details > summary')].map(text),
  evidence:explore.querySelectorAll('details.run-explore details.run-evidence').length,five:ctx.fiveRow(run)};
};
process.stdout.write(JSON.stringify({full:facts(full),partial:facts(partial),
 vpt:[ctx.vpt(full),ctx.vpt(partial),ctx.vpt({...full,claims_verified:null}),ctx.vpt({...full,artifacts_produced:null}),ctx.vpt({...full,prompts:0})],
 vptText:[ctx.vptText(full),ctx.vptText(partial)]}));
"""


def test_web_app_never_headlines_prompts():
    src = open(os.path.join(REPO, "site", "index.html"), encoding="utf-8").read()
    # Posts lead with the builder's work. Counts remain supporting observations.
    assert "heroN:r.prompts" not in src
    assert "heroK:'prompts typed'" not in src and "heroK:'prompts'" not in src
    full = {"id": "11111111-1111-1111-1111-111111111111", "title": "A two-hour probe", "visibility": "public",
            "profile_id": "p1", "profiles": {"handle": "sample"}, "harness": "Claude Code", "prompts": 47,
            "tool_calls": 213, "commits": 3, "files_touched": 9, "duration_s": 8400, "claims": 9,
            "claims_verified": 6, "artifacts_produced": 4, "reach": 1, "reach_reason": "REACH SENTENCE"}
    partial = {**full, "claims": None, "claims_verified": None, "artifacts_produced": None, "reach": None}
    import subprocess
    out = json.loads(subprocess.run(["node", "-e", WEB_CARD, json.dumps([full, partial])], cwd=REPO, check=True,
                                    capture_output=True, text=True).stdout)
    card = out["full"]
    # The real run card: title, then the recorded-facts strip, then the small activity line, then
    # the collapsed details. The strip is work (GrinderContract.heroStats); it has no prompt cell.
    assert all(i >= 0 for i in card["order"]) and card["order"] == sorted(card["order"])
    assert card["title"] == "A two-hour probe"
    assert card["strip"] == [["Commits", "3"], ["Elapsed", "2h 20m"], ["Files touched", "9"]]
    assert not re.search(r"prompt", card["faceText"], re.I) and "verified per turn" not in card["faceText"]
    assert 'run-rank' not in card["markup"]
    # Typed turns are a supporting observation, with the other measurements, behind the disclosure
    # ("Explore this run" until 00bdaf8). Its source-and-limits block is there too.
    assert card["summary"] == "Receipts and measurements" and card["evidence"] == 1
    assert card["measured"] == ["Human messages: 47", "Tool requests: 213", "Files present after writes: 4",
                                "Claims with matching evidence: 6 of 9"]
    slice_ = src[src.index("function runCard("):src.index("function wireKudos(")]
    assert slice_.index('<div class="title">') < slice_.index('${visual}')
    assert "GrinderContract.heroStats" in slice_ and "fiveRow(r)," in slice_
    # Share export is exercised by check-moment-fixtures.py; its call signature
    # is not part of the card's headline contract.
    # Social profiles show public work and responses, not activity-as-quality rankings.
    prof = src[src.index("async function viewProfile("):src.index("async function refreshAuth(")]
    assert "Public runs" in prof and "XUDOS received" in prof
    assert "Followers-only runs stay off this profile" in prof
    assert "verified per turn" not in prof
    assert '<div class="k">prompts</div>' not in prof
    # a missing part is never a 0 and never a private project: the ratio is null (a dash), and the
    # measurement rows (site/run-context.js metrics, ce9b610) draw only what the run recorded.
    assert out["vpt"] == [(6 + 4) / 47, None, None, None, None] and out["vptText"] == ["0.21", "-"]
    assert out["partial"]["measured"] == ["Human messages: 47", "Tool requests: 213"]
    assert not re.search(r"<strong>(?:0|—|-)</strong>", out["partial"]["five"])
    assert "not measured yet: it needs every turn labelled as undoing the one before it" in src
    assert "Promised is not measured yet" in src
    five = src[src.index("const VPT_TIP="):src.index("const pace=")]   # the headline tip too
    for private in ("Transcripto", "repo E", "Helicon"):
        assert private not in five and private not in out["full"]["five"] and private not in card["markup"], private
    # The reach cell left the web card with the five-row (ce9b610, 4 Oct 2026). Nothing stands in
    # for it: no reach row and no invented sentence, whether or not the run carried one.
    assert "r.reach_reason||VPT_SRC.reach" not in src
    for run in (out["full"], out["partial"]):
        assert not re.search(r"reach", run["five"], re.I) and "REACH SENTENCE" not in run["markup"]


def test_profile_headlines_verified_per_turn_and_leaves_missing_runs_out():
    full = {"turns_typed": 47, "claims": 9, "claims_verified": 6, "artifacts_produced": 4, "commits": 3,
            "harness": "Claude Code"}
    partial = {"turns_typed": 100, "commits": 1, "harness": "Claude Code"}   # no claim counts: left OUT
    t = totals_of([full, partial])
    assert t["verified_per_turn"] == "0.21" and t["vpt_runs_missing"] == 1
    assert t["prompts"] == 147                                                # cost still totals every run
    assert "over 1 of 2 runs" in t["vpt_formula"]
    assert totals_of([partial])["verified_per_turn"] == "—"
    assert "needs" in totals_of([partial])["vpt_formula"]

    gh = {"login": "x", "name": "X", "bio": "", "public_repos": 1, "recent_commits": 0, "recent_repos": []}
    html = render_profile({"gh": gh, "activities": [build_activity(full)], "totals": t})
    first_cell = html[html.index('<div class="stats">'):].split("</div></div>")[0]
    assert "Verified per turn" in first_cell and "0.21" in first_cell
    assert '<div class="k">Prompts</div>' not in html
    assert "Cost — 147 prompts typed across 2 runs" in html
    assert "0.21 verified per turn" in html and "47 prompts · cost" in html
