"""Run cards retain recorded activity and honest, shareable session facts."""
import json
import subprocess
from pathlib import Path

from agentgrinder.metrics import build_activity
from agentgrinder.render import render_card

ROOT = Path(__file__).resolve().parents[1]

SCRIPT = r"""
const fs=require('fs'),vm=require('vm');
const root=process.argv[1];
const {ctx:context}=require(root+'/tests/site-card-context.cjs')(root);
const base={id:'r1',profile_id:'p1',created_at:'2026-09-14T00:00:00Z',title:'Plain run',
 started_at:'2026-09-14T00:00:00Z',duration_s:600,prompts:3};
const plain=vm.runInContext('runCard('+JSON.stringify(base)+',false,0)',context);
const ridge=Array.from({length:50},(_,i)=>i%9),workers=Array.from({length:50},(_,i)=>i>8&&i<42?(i%4):0);
const shaped=vm.runInContext('runCard('+JSON.stringify({...base,prompts:12,ridge,worker_bins:workers,
 ridge_basis:'wall-time',ridge_wall_seconds:605,commit_bins:[12,38],shell_calls:4,files_touched:5,commits:2,
 project:'agentgrinder-public',
 output_url:'https://github.com/example/repo/pull/1'})+',false,0)',context);
const outputOnly=vm.runInContext('runCard('+JSON.stringify({...base,prompts:12,ridge,worker_bins:workers,
 ridge_basis:'wall-time',ridge_wall_seconds:605,commit_bins:[],commits:0,
 output_url:'https://github.com/example/repo/pull/1'})+',false,0)',context);
const zero=vm.runInContext('runCard('+JSON.stringify({...base,duration_s:0,prompts:0,tool_calls:0,
 files_touched:0,commits:0})+',false,0)',context);
const unknown=vm.runInContext('runCard('+JSON.stringify({...base,duration_s:null,prompts:null,
 tool_calls:null,shell_calls:null,files_touched:null,commits:null,project:'session',
 private_title_prompt:'PRIVATE PROMPT',command:'PRIVATE COMMAND',path:'/private/secret.py',
 tool_output:'PRIVATE OUTPUT'})+',false,0)',context);
process.stdout.write(JSON.stringify({plain,shaped,outputOnly,zero,unknown}));
"""


def render():
    result = subprocess.run(
        ["node", "-e", SCRIPT, str(ROOT)], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def test_card_without_ridge_keeps_its_recorded_trace():
    """Short sittings show counts; the local legacy preview keeps its recorded trace."""
    plain = render()["plain"]
    assert "3 messages you wrote" in plain
    assert 'class="activity-bar"' not in plain  # Short sittings show counts, not a synthetic curve.
    activity = build_activity({
        "athlete": "you", "title": "Plain", "harness": "Cursor", "project": "sample",
        "turns_typed": 3, "tool_calls": 2, "commits": 1, "rhythm": [1, 2, 1],
    })
    html = render_card(activity)
    assert 'class="fc-spark"' in html and 'class="fc-line"' in html      # the rhythm, drawn
    assert "Recorded activity per slice · source order; timing unknown" in html
    assert "Local run · not signed in." in html
    assert "Nothing is on STRIVE until you choose to save it." in html
    assert "1 commit landed in sample" in html


def test_card_draws_one_primary_ridge_and_story_before_effort():
    html = render()["shaped"]
    assert html.count('class="post-trail"') == 1
    assert html.count('class="activity-bar"') == 44
    assert html.count('class="activity-commit"') == 2
    assert "Tool calls / min; idle gaps compressed" in html
    assert "12 seconds each" in html
    assert "Ticks: commits" in html
    assert html.index("Plain run") < html.index('class="post-trail"') < html.index("Receipts and measurements")
    assert "See the work" in html and "Open PR" in html
    assert "4</strong> Shell calls" in html and "5</strong> Files touched" in html
    assert "No work route was captured" in html  # A time histogram supplies no project route.
    output_facts = render()["outputOnly"]
    assert "Open PR" in output_facts and "0</strong> Commits" in output_facts


def test_card_keeps_recorded_zero_and_hides_missing_metrics():
    rendered = render()
    zero = rendered["zero"]
    assert "0 messages you wrote · 0 agent tool calls" in zero
    assert "0</strong> Files touched" in zero and "0</strong> Commits" in zero
    assert "Activity timing was not captured." in rendered["unknown"]
    assert "0 agent tool calls" not in rendered["unknown"]
    assert 'class="post-stat"' not in rendered["unknown"]




def test_browser_card_omits_missing_output_and_sensitive_capture_data():
    unknown = render()["unknown"]
    assert ">Project<" not in unknown
    assert "Code activity" not in unknown
    assert 'class="run-output"' not in unknown
    for private in ("PRIVATE PROMPT", "PRIVATE COMMAND", "/private/", "PRIVATE OUTPUT"):
        assert private not in unknown



OG_SCRIPT = r"""
import {linkPreviewCard as card} from './server/public-run.mjs';
import LinkPreview from './site/link-preview-card.js';
const legacy={id:'r1',title:'Plain run',caption:'c',project:'p',visibility:'public',prompts:3,
 commits:1,wall_time_s:600,rhythm:[1,2,1,3,2],profiles:{handle:'sample'}};
const ridge=Array.from({length:50},(_,i)=>i%9),workers=Array.from({length:50},(_,i)=>i>8&&i<42?(i%4):0);
const shaped={...legacy,ridge,worker_bins:workers,commit_bins:[12,38],ridge_basis:'wall-time',
 ridge_wall_seconds:605.5};
process.stdout.write(JSON.stringify({
 shaped:JSON.stringify(card(shaped)),
 legacy:JSON.stringify(card(legacy)),
 shapedSeries:LinkPreview.series(shaped),legacySeries:LinkPreview.series(legacy)}));
"""


def test_og_renderer_keeps_legacy_cards_and_draws_a_persisted_ridge():
    """The hosted image tree preserves ridge/legacy series without inventing a label."""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", OG_SCRIPT],
        cwd=ROOT, check=True, capture_output=True, text=True)
    rendered = json.loads(result.stdout)
    assert rendered["legacySeries"]["filled"] is False
    assert rendered["legacySeries"]["values"] == [1, 2, 1, 3, 2]
    assert rendered["shapedSeries"]["filled"] is True
    assert len(rendered["shapedSeries"]["values"]) == 50
    assert rendered["legacy"] != rendered["shaped"]
    # the image carries no series label: the page's card draws the line without one
    for label in ("Session trace", "Agent ridge"):
        assert label not in rendered["legacy"] and label not in rendered["shaped"]


# Card truth: live public OG images on 2026-09-18 printed 0 beside a ridge drawn from 98
# calls, and drew a flat line for a pre-ridge row. These cases pin the share image only.
OG_TRUTH_SCRIPT = r"""
import {linkPreviewCard as card} from './server/public-run.mjs';
import LinkPreview from './site/link-preview-card.js';
const ridge=Array.from({length:50},(_,i)=>i%9);
const workers=Array.from({length:50},(_,i)=>i>8&&i<42?(i%4):0);
const walk=n=>{
 if(n==null)return[];
 if(typeof n==='string'||typeof n==='number')return[String(n)];
 if(Array.isArray(n))return n.flatMap(walk);
 if(typeof n==='object')return walk(n.props?.children);
 return[];
};
const after=(texts,label)=>{
 const i=texts.indexOf(label);return i<0?null:texts[i-1]??null;
};
const base={id:'c1',title:'Cursor night review ridge',caption:'busy graph',
 project:'CODE-worktrees-strava-night-review-20260915',visibility:'public',prompts:12,
 tool_calls:0,ridge_tool_calls:98,ridge,worker_bins:workers,ridge_basis:'wall-time',
 ridge_wall_seconds:3600,profiles:{handle:'sample'}};
const withCode={...base,shell_calls:4,files_touched:5,commits:2};
const effortOnly=base;
const nullRidge={id:'c2',title:'Pre ridge run',caption:'old row',project:'demo',
 visibility:'public',prompts:6,tool_calls:28,ridge:null,rhythm:[0,0,0,0,0],
 profiles:{handle:'sample'}};
const shaped=walk(card(withCode));
const effortTexts=walk(card(effortOnly));
const nullBody=JSON.stringify(card(nullRidge));
const nullTexts=walk(card(nullRidge));
process.stdout.write(JSON.stringify({
 toolCalls:LinkPreview.toolCallCount(withCode),
 toolCallsEffortOnly:after(effortTexts,'Tool calls'),
 codeActivity:after(effortTexts,'Code activity'),
 joined:shaped.join(' '),
 titlePresent:shaped.includes(withCode.title),
 nullHasPolyline:LinkPreview.series(nullRidge)!==null,
 nullHasPolygon:nullBody.includes('"type":"polygon"'),
 nullTexts,
}));
"""


def _og_truth():
    result = subprocess.run(
        ["node", "--input-type=module", "-e", OG_TRUTH_SCRIPT],
        cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def test_og_card_uses_ridge_tool_calls_when_tool_calls_is_zero():
    """A ridge drawn from 98 calls must not print 0 in the tool call slots.

    The count still reads 98 wherever it is shown; the link image itself no longer prints a
    tool-call total, because PRODUCT.md keeps tool-call totals off a card's facts."""
    rendered = _og_truth()
    assert rendered["toolCalls"] == 98
    assert rendered["toolCallsEffortOnly"] is None
    assert "Tool calls" not in rendered["joined"] and " 0 " not in f' {rendered["joined"]} '
    assert rendered["codeActivity"] is None
    assert "strava night review" not in rendered["joined"]
    assert rendered["titlePresent"] is True


def test_og_card_draws_no_flat_line_when_ridge_is_null():
    """A null ridge is a missing shape. Do not draw a flat polyline from leftover rhythm."""
    rendered = _og_truth()
    assert rendered["nullHasPolyline"] is False
    assert rendered["nullHasPolygon"] is False
    joined = " ".join(rendered["nullTexts"]).lower()
    assert "not recorded" not in joined
    assert "unknown" not in joined
    assert "Session" not in rendered["nullTexts"]
    # Six typed turns and 28 tool calls are single-run counts, not facts the image draws; the
    # author's caption stands in for the missing trace.
    assert "6" not in rendered["nullTexts"] and "28" not in rendered["nullTexts"]
    assert "old row" in rendered["nullTexts"]
