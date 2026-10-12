"""An outcome label is printed only when the run recorded an outcome (25 Sep 2026: REAL for shitty runs).

The "Achieved" eyebrow itself left the card on 4 Oct 2026 (6681e56, "Lead runs with author
outcomes and invite useful feedback"): the card now leads with the author's own words and marks
recorded work with "Work linked". The rule the eyebrow obeyed is unchanged, and it is checked here
against the functions that own it today, by running them.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site/index.html").read_text()

PROBE = r"""
const fs=require('fs'),vm=require('vm');
const F=require('./site/feed-card.js'),C=require('./site/run-context.js');
const s=fs.readFileSync('site/index.html','utf8');
const cut=(from,to)=>s.slice(s.indexOf(from),s.indexOf(to,s.indexOf(from)));
// The retained rule, with its own URL guard and its own typed-run guard.
const ctx={URL};vm.createContext(ctx);
vm.runInContext(cut('function safeOutputUrl(','// A repository link is an https address')+
 cut('const typedOnlyRun=','function runCard(')+cut('function achievedLabel(r){','function proofRouteHtml(r)')+
 ';this.achievedLabel=achievedLabel;',ctx);
const rows=JSON.parse(process.argv[1]);
process.stdout.write(JSON.stringify(rows.map(r=>{
 const card=F.card({id:'r',title:'A run',...r},{count:0});
 return {label:ctx.achievedLabel(r),achieved:/Achieved/.test(card),chip:card.includes('<span class="fc-chip">Work linked</span>'),
  link:(card.match(/<p class="fc-output-link"><a href="([^"]*)"/)||[])[1]||null,context:C.context(r)};
})));
"""

ROWS = [
    {"tool_calls": 300, "duration_s": 9000, "prompts": 40},                # busy, and nothing recorded
    {"commits": 0, "shipped": [], "receipts": []},                        # recorded zeroes are not an outcome
    {"commits": 3},
    {"shipped": ["Released the importer"]},
    {"receipts": [{"label": "PR", "url": "https://github.com/o/r/pull/1"}]},
    {"output_url": "https://github.com/o/r/pull/1"},
    {"output_url": "javascript:alert(1)"},                                # not a link a reader can open
    {"commits": 3, "trace_basis": "typed-by-author"},                     # typed claims earn no label
]


def test_achieved_is_conditional():
    out = json.loads(subprocess.run(["node", "-e", PROBE, json.dumps(ROWS)], cwd=ROOT, check=True,
                                    capture_output=True, text=True).stdout)
    achieved = '<div class="run-story-label achieved">Achieved</div>'
    assert [row["label"] for row in out] == ["", "", achieved, achieved, achieved, achieved, "", ""]
    # The literal exists once, inside that conditional, and no card prints it unconditionally.
    assert achieved not in INDEX.replace("return done?'<div class=\"run-story-label achieved\">Achieved</div>':'';", "")
    assert not any(row["achieved"] for row in out)
    # Today's card: "Work linked" and the link to the work appear only beside a real https output.
    assert [row["chip"] for row in out] == [False, False, False, False, False, True, False, False]
    assert [row["link"] for row in out] == [None, None, None, None, None, "https://github.com/o/r/pull/1", None, None]
    # A run the author did not describe says so, and never reads activity as a result.
    assert out[0]["context"] == ('<p class="meta run-context-none">The author has not described this run. '
                                 'Activity alone cannot tell us what was achieved.</p>')
