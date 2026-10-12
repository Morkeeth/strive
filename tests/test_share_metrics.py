"""Share cards use the same honest session strip as the browser card."""
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = r"""
import fs from 'node:fs';
import vm from 'node:vm';
import {card,html,linkPreviewCard} from './server/public-run.mjs';

const context={window:{},URL};
vm.runInNewContext(fs.readFileSync('./site/sharing.js','utf8'),context);
const {metricStrip:strip,storyFacts:story,traceSeries:trace}=context.window.GrinderSharing;
const base={id:'r1',title:'A real run',visibility:'public',profiles:{handle:'sample'}};
const zero={...base,duration_s:0,prompts:0,tool_calls:0,files_touched:0,commits:0};
const unknown={...base,duration_s:null,prompts:null,tool_calls:null,files_touched:null,commits:null};
const rich={...base,caption:'Human caption',project:'agentgrinder-public',output_url:'https://github.com/example/repo/pull/34',
 shell_calls:4,files_touched:7,commits:2,tool_calls:22,private_title_prompt:'PRIVATE PROMPT',
 command:'PRIVATE COMMAND',path:'/private/repo/secret.py',tool_output:'PRIVATE OUTPUT'};
const generic={...base,project:'session',tool_calls:9};
const cursor={...rich,ridge:Array.from({length:50},(_,i)=>i%7),worker_bins:Array(50).fill(0),
 ridge_basis:'wall-time',ridge_wall_seconds:900,rhythm:[9,9]};
const grok={...base,harness:'Grok Bot',duration_s:null,rhythm:[1,1,1],
 trace_basis:'typed-turn order; Grok Bot export has no top-level event timestamps'};
const grokRidge={...grok,ridge:[1,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,13,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,0,0,0,0,0,0],
 worker_bins:Array(50).fill(0),ridge_basis:'turn-order'};
const text=node=>{
  if(node==null)return[];
  if(typeof node==='string'||typeof node==='number')return[String(node)];
  const children=node.props&&node.props.children;
  return Array.isArray(children)?children.flatMap(text):text(children);
};
const page=run=>{
  const markup=html(run),body=markup.slice(markup.indexOf('<body')).replace(/<style[\s\S]*?<\/style>/g,'');
  const stats=(body.match(/<dl class="share-stats"[\s\S]*?<\/dl>/)||[''])[0];
  const facts=(body.match(/<dl class="post-facts"[\s\S]*?<\/dl>/)||[''])[0];
  return {
    image:(markup.match(/<meta property="og:image" content="([^"]*)">/)||[])[1],
    stats:[...stats.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map(m=>[m[1],m[2]]),
    facts:[...facts.matchAll(/<summary[^>]*>([^<]*)<\/summary>[\s\S]*?<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map(m=>[m[1],m[2]]),
    output:(body.match(/<a class="output"[^>]*>[^<]*<\/a>/)||[null])[0],
    body,
  };
};
process.stdout.write(JSON.stringify({
  zero:strip(zero),
  unknown:strip(unknown),
  rich:story(rich),
  generic:story(generic),
  cursorTrace:trace(cursor),
  grokTrace:trace(grok),
  grokRidgeTrace:trace(grokRidge),
  // The link image a post unfurls (og:image -> /api/og?run= -> linkPreviewCard).
  ogRich:text(linkPreviewCard(rich)),
  ogGeneric:text(linkPreviewCard(generic)),
  ogZero:text(linkPreviewCard(zero)),
  ogUnknown:text(linkPreviewCard(unknown)),
  // The older image tree /api/run?image=1 still serves.
  runImageRich:text(card(rich)),
  runImageGeneric:text(card(generic)),
  runImageZero:text(card(zero)),
  runImageUnknown:text(card(unknown)),
  // The page the link opens.
  pageRich:page(rich),
  pageGeneric:page(generic),
  pageZero:page(zero),
  pageUnknown:page(unknown),
}));
"""


def render():
    result = subprocess.run(
        ["node", "--input-type=module", "-e", SCRIPT],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_download_share_strip_preserves_zero_and_hides_missing():
    result = render()
    assert result["zero"] == [
        ["Session", "0s"],
        ["Turns", "0"],
        ["Tool calls", "0"],
    ]
    assert result["unknown"] == []


STAT_LABELS = ("Commits", "Files", "Files changed", "Files touched", "Elapsed", "Time", "Turns", "Typed turns", "Tool calls")


def test_public_link_preview_preserves_zero_and_omits_unrecorded_fields():
    # A link preview is the page a link opens plus the image it unfurls with. The page keeps a
    # recorded zero as a zero and draws nothing for a field the row did not record.
    result = render()
    assert result["pageZero"]["image"].endswith("/api/og?run=r1&v=4")
    assert result["pageZero"]["stats"] == [["Commits", "0"], ["Files changed", "0"], ["Typed turns", "0"]]
    assert result["pageZero"]["facts"] == [["Typed turns", "0"], ["Tool calls", "0"], ["Elapsed", "0 sec"]]
    assert result["pageUnknown"]["stats"] == []
    assert result["pageUnknown"]["facts"] == [["Typed turns", "Not captured"], ["Tool calls", "Not captured"],
                                              ["Files touched", "Not captured"]]
    # Neither image guesses. Nothing the row did not record is drawn, and "Unknown" is never a value.
    for tree in ("ogUnknown", "runImageUnknown"):
        assert "Unknown" not in result[tree]
        for label in STAT_LABELS:
            assert label not in result[tree], (tree, label)
        assert not [t for t in result[tree] if any(ch.isdigit() for ch in t)], tree
    # The link image (360561c, 11 Oct 2026) prints its figure above its label and keeps up to three
    # positive facts. A recorded zero may be left off it; it is never turned into another number.
    for tree in ("ogZero", "runImageZero"):
        assert "Unknown" not in result[tree]
        assert [t for t in result[tree] if any(ch.isdigit() for ch in t)] in ([], ["0"] * sum(l in result[tree] for l in STAT_LABELS)), tree


def test_share_surfaces_tell_output_project_and_code_story_without_raw_data():
    result = render()
    assert result["rich"] == {
        "project": "agentgrinder-public",
        "output": "PR linked",
        "code": "4 shell calls · 7 files changed · 2 commits",
    }
    assert result["generic"] == {
        "project": None,
        "output": None,
        "code": "9 tool calls",
    }
    # The link image: figure, then label. Exactly the recorded facts, and the author's caption.
    rich = result["ogRich"]
    assert rich == ["S", "STRIVE", "S", "sample", "A real run", "2", "Commits", "7", "Files", "22", "Tool calls", "Human caption"]
    assert rich[rich.index("Commits") - 1] == "2"
    assert rich[rich.index("Tool calls") - 1] == "22" and rich[rich.index("Files") - 1] == "7"
    assert result["ogGeneric"] == ["S", "STRIVE", "S", "sample", "A real run", "9", "Tool calls", ""]
    # The output: the page links it, and the run image says work is linked ("PR linked" became
    # "Work linked" with d442d80). A run with no output link says neither.
    assert result["pageRich"]["output"] == ('<a class="output" href="https://github.com/example/repo/pull/34" '
                                            'rel="noopener noreferrer">View linked output</a>')
    assert "Work linked" in result["runImageRich"]
    assert result["pageGeneric"]["output"] is None and "Work linked" not in result["runImageGeneric"]
    assert result["pageRich"]["stats"] == [["Commits", "2"], ["Files changed", "7"], ["Tool calls", "22"]]
    for tree in ("ogRich", "runImageRich"):
        joined = " ".join(result[tree])
        assert "agentgrinder-public" not in joined     # neither image names the project
        for private in ("PRIVATE PROMPT", "PRIVATE COMMAND", "/private/", "PRIVATE OUTPUT"):
            assert private not in joined
    for private in ("PRIVATE PROMPT", "PRIVATE COMMAND", "/private/", "PRIVATE OUTPUT", "secret.py"):
        assert private not in result["pageRich"]["body"]
    for tree in ("ogGeneric", "runImageGeneric"):
        assert "Output" not in result[tree]


def test_download_uses_cursor_timed_ridge_and_keeps_grok_time_unknown():
    result = render()
    assert result["cursorTrace"]["label"] == "Tool calls over wall time"
    assert len(result["cursorTrace"]["values"]) == 50
    assert result["grokTrace"]["label"] == "Session activity · time basis unknown"
    assert result["grokTrace"]["values"] == [1, 1, 1]
    assert result["unknown"] == []


def test_share_image_labels_turn_order_ridge_not_call_order():
    result = render()
    assert result["grokRidgeTrace"]["label"] == "Tool calls over turn order"
    assert result["grokRidgeTrace"]["values"][24] == 13
