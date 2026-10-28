"""The verdict block on the solo card, the export, and the hosted card's paths. Null-safe both ways."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agentgrinder.push import export_run
from agentgrinder.solo import parse_solo
from agentgrinder.solocard import _verdict_block, render_solo_card
from tests.test_coach_tools import _sitting

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_card_without_coach_or_series_draws_no_verdict_block(tmp_path):
    run = parse_solo(_sitting(tmp_path)[0], athlete="t")
    html = render_solo_card(run)
    assert 'class="verdict"' not in html
    assert _verdict_block({}) == ""


def test_card_with_coach_and_series_draws_both(tmp_path):
    run = parse_solo(_sitting(tmp_path)[0], athlete="t")
    run.update(coach_verdict="1 of 2 claims had evidence in their own turn.", coach_plan="Name the test\nCommit out.md",
               coach_tool_calls=6, coach_mode="strands agent loop · local scripted model (no network, no spend)",
               progress=dict(verdict="helped", delta=0.5, prediction="ships 2 files"),
               progress_line="helped vs your last grind on p: verified per turn up +0.50 (0.50 -> 1.00), previous x, 2 grinds on this project.")
    html = render_solo_card(run)
    assert "verdict produced by <b>6</b> tool calls" in html
    assert "1 of 2 claims had evidence" in html
    assert "<li>Name the test</li><li>Commit out.md</li>" in html
    assert "<b>helped</b>" in html and "you predicted: ships 2 files" in html
    # the verdict sits under the card, never inside it: the card is the feed card
    assert html.index("</article>") < html.index('class="below verdict"')


def test_series_alone_draws_the_progress_line(tmp_path):
    run = parse_solo(_sitting(tmp_path)[0], athlete="t")
    run.update(progress=dict(verdict="baseline", delta=None, prediction=None),
               progress_line="baseline on p: this is the first grind recorded on it. Two measured grinds give a verdict.")
    html = render_solo_card(run)
    assert "<b>baseline</b>" in html and "The coach" not in html


def test_export_run_carries_the_coach_and_progress_fields_and_drops_nulls():
    run = dict(project="p", turns_typed=3, claims=2, claims_verified=1, artifacts_produced=1,
               coach_verdict="v", coach_plan="a\nb", coach_tool_calls=8,
               progress=dict(verdict="helped", delta=0.5))
    out = export_run(run)
    assert out["coach_verdict"] == "v" and out["coach_plan"] == "a\nb" and out["coach_tool_calls"] == 8
    assert out["progress_verdict"] == "helped" and out["progress_delta"] == 0.5
    leaked = export_run({
        "turns_typed": 3,
        "coach_verdict": "Missing /Users/casey/Documents/notes/secret-plan.md",
        "coach_plan": "Recreate ~/private/keys.env",
        "coach_experiment": {"instruction": "Open C:\\Users\\casey\\secret.py"},
        "coach_experiment_local": {"instruction": "Open /Users/casey/Documents/notes/secret-plan.md"},
    })
    blob = str(leaked)
    assert "Users/casey" not in blob and "secret-plan.md" not in blob
    assert "~/" not in blob and "C:\\Users" not in blob
    assert "coach_experiment_local" not in leaked
    bare = export_run(dict(project="p", turns_typed=3))
    assert "coach_verdict" not in bare and "progress_verdict" not in bare


def test_site_keeps_coach_fields_null_safe_behind_more():
    import json
    import subprocess
    html = open(os.path.join(REPO, "site", "index.html"), encoding="utf-8").read()
    cols = ["claims", "claims_verified", "artifacts_produced", "coach_verdict", "coach_plan",
            "coach_tool_calls", "coach_mode", "progress_verdict"]
    # The insert moved to site/import-row.js (the one builder both import paths save through).
    # Run it, and run the real coachBlock: a missing field is null on the row and draws nothing.
    out = json.loads(subprocess.run(["node", "-e", r"""
const fs=require('fs'),vm=require('vm');
const Row=require('./site/import-row.js'),GrinderContract=require('./site/run-contract.js');
const s=fs.readFileSync('site/index.html','utf8');
const esc=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={GrinderContract,esc,coachModeBanner:()=>''};vm.createContext(ctx);
vm.runInContext(s.slice(s.indexOf('function coachBlock(r){'),s.indexOf('function safeOutputUrl('))+';this.coachBlock=coachBlock;',ctx);
const opts={profileId:'p',title:'t',project:'proj'};
const full={claims:2,claims_verified:1,artifacts_produced:3,coach_verdict:'1 of 2 claims had evidence.',coach_plan:'Name the test\nCommit out.md',
 coach_tool_calls:6,coach_mode:'local scripted model',progress_verdict:'helped'};
const zero={claims:0,claims_verified:0,artifacts_produced:0,coach_tool_calls:0};
process.stdout.write(JSON.stringify({bare:Row.build({turns_typed:3},opts),full:Row.build({turns_typed:3,...full},opts),zero:Row.build(zero,opts),
 blocks:[ctx.coachBlock(null),ctx.coachBlock({}),ctx.coachBlock(Row.build({turns_typed:3},opts)),ctx.coachBlock({coach_plan:'a plan with no verdict'}),
  ctx.coachBlock(Row.build({turns_typed:3,...full},opts)),ctx.coachBlock({progress_verdict:'baseline'})]}));
"""], cwd=REPO, check=True, capture_output=True, text=True).stdout)
    for col in cols:
        assert col in out["bare"] and out["bare"][col] is None, col      # the insert carries it, as null
    assert {col: out["full"][col] for col in cols} == {
        "claims": 2, "claims_verified": 1, "artifacts_produced": 3, "coach_verdict": "1 of 2 claims had evidence.",
        "coach_plan": "Name the test\nCommit out.md", "coach_tool_calls": 6, "coach_mode": "local scripted model",
        "progress_verdict": "helped"}
    for col in ("claims", "claims_verified", "artifacts_produced", "coach_tool_calls"):
        assert out["zero"][col] == 0, col                                 # a measured zero stays zero, not null
    # null-safe: no verdict, no block. A plan alone is not a verdict either.
    assert out["blocks"][:4] == ["", "", "", ""]
    assert out["blocks"][4] == ('<div class="grp">recorded automated review · <b>6</b> recorded tool calls</div>'
                                '<div class="para">1 of 2 claims had evidence.</div>'
                                '<ul class="plan"><li>Name the test</li><li>Commit out.md</li></ul>'
                                '<div class="rule-line"><b>helped</b> vs your last grind on this project</div>')
    assert out["blocks"][5] == '<div class="rule-line"><b>baseline</b> vs your last grind on this project</div>'
    # Behind the disclosure: coachBlock is one of the parts inside the collapsed block, never on
    # the card's face. The summary read "Explore this run" until 00bdaf8 (11 Oct 2026).
    card = html[html.index("function runCard("):html.index("function wireKudos(")]
    inner = card[card.index("const exploreInner=["):card.index("].filter(Boolean).join('');")]
    assert "typedOnlyRun(r)?'':coachBlock(r)," in inner and card.count("coachBlock(r)") == 1
    assert ('<details class="ridge-more run-explore" id="run-detail-${esc(r.id)}" data-run-detail="1">'
            "<summary>${typedOnlyRun(r)?'Update details':'Receipts and measurements'}</summary><div class=\"run-detail-body\">${exploreInner}</div></details>") in card
    assert card.index("const exploreInner=[") < card.index("<summary>${typedOnlyRun(r)?'Update details':'Receipts and measurements'}</summary>")
    subprocess.run(["node", "scripts/test-detail-headline.mjs"], cwd=REPO, check=True)


def test_migration_is_additive_and_nullable():
    sql = open(os.path.join(REPO, "supabase", "migrations", "2026-09-03-coach.sql"), encoding="utf-8").read().lower()
    for col in ("claims", "claims_verified", "artifacts_produced", "coach_verdict", "coach_plan",
                "coach_tool_calls", "progress_verdict"):
        assert f"add column if not exists {col}" in sql, col
    for bad in ("drop ", "not null", "delete ", "truncate", "rename"):
        assert bad not in sql.replace("nothing here drops, renames", ""), bad
