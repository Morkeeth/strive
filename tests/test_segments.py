"""Contracts for the fixed-task public segment."""
from pathlib import Path
import json
import subprocess
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]


def test_ranking_shares_places_for_equal_wall_time_and_tool_calls():
    runs = [
        {"id": "later", "wall_time_s": 70, "tool_calls": 2},
        {"id": "tie-b", "wall_time_s": 45, "tool_calls": 3},
        {"id": "tie-a", "wall_time_s": 45, "tool_calls": 3},
        {"id": "more-tools", "wall_time_s": 45, "tool_calls": 5},
    ]
    script = """
const {rankRuns}=require(process.argv[1]);
const ranked=rankRuns(JSON.parse(process.argv[2]));
process.stdout.write(JSON.stringify(ranked.map(run=>[run.id,run.rank])));
"""
    result = subprocess.run(
        ["node", "-e", script, str(ROOT / "site/segments.js"), json.dumps(runs)],
        check=True,
        capture_output=True,
        text=True,
    )
    assert json.loads(result.stdout) == [
        ["tie-a", 1],
        ["tie-b", 1],
        ["more-tools", 3],
        ["later", 4],
    ]


def test_segment_page_renders_three_labelled_fixture_runs():
    pytest.importorskip("playwright")
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/check-segment-fixtures.py")],
        cwd=ROOT,
        check=True,
    )


def test_segment_schema_stays_in_strava_and_public_reads_are_filtered():
    migration = (ROOT / "supabase/strava/001_segments.sql").read_text()
    page = (ROOT / "site/segments.js").read_text()
    index = (ROOT / "site/index.html").read_text()
    assert "strava.segments" in migration
    assert "strava.runs" in migration
    assert "wall_time_s" in migration
    assert "public." not in migration
    assert "This run was on segment:" in page
    # Public reads: run the real leaderboard loader against a client that holds runs of every
    # audience on this segment and returns exactly what the page asks for.
    board = json.loads(subprocess.check_output(["node", "-e", r"""
const {JSDOM}=require('jsdom');const w=new JSDOM('<main id="app"></main>').window;global.window=w;
const S=require('./site/segments.js');
const rows=[
 {id:'run-public-fast',segment_id:'segment-01',visibility:'public',title:'TEST DATA public fast',wall_time_s:40,tool_calls:2},
 {id:'run-private',segment_id:'segment-01',visibility:'private',title:'TEST DATA private',wall_time_s:1,tool_calls:1},
 {id:'run-followers',segment_id:'segment-01',visibility:'link',title:'TEST DATA followers',wall_time_s:2,tool_calls:1},
 {id:'run-friends',segment_id:'segment-01',visibility:'close_friends',title:'TEST DATA friends',wall_time_s:3,tool_calls:1},
 {id:'run-anonymous',segment_id:'segment-01',visibility:'anonymous',title:'TEST DATA anonymous',wall_time_s:4,tool_calls:1},
 {id:'run-public-slow',segment_id:'segment-01',visibility:'public',title:'TEST DATA public slow',wall_time_s:90,tool_calls:2},
 {id:'run-other-segment',segment_id:'segment-02',visibility:'public',title:'TEST DATA other segment',wall_time_s:5,tool_calls:1},
];
const calls=[];
const client={from(table){const filters=[];const q={select(){return q},
 eq(column,value){calls.push([table,column,value]);filters.push(r=>r[column]===value);return q},
 maybeSingle:async()=>({data:{id:'segment-01',name:'TEST DATA segment',description:'TEST DATA',task_url:'https://example.test/task',repo_url:'https://example.test/repo'},error:null}),
 then(res,rej){return Promise.resolve({data:rows.filter(r=>filters.every(f=>f(r))),error:null}).then(res,rej)}};return q}};
const slot=w.document.getElementById('app');
S.mount({client,id:'segment-01',slot,frame(){},status(){}}).then(()=>process.stdout.write(JSON.stringify({
 calls,
 shown:[...slot.querySelectorAll('.segment-row h2 a')].map(a=>[a.textContent,a.getAttribute('href')]),
 meta:slot.querySelector('.head .meta').textContent,text:slot.textContent})));
"""], cwd=ROOT, text=True))
    assert board["calls"] == [["segments", "id", "segment-01"], ["runs", "segment_id", "segment-01"], ["runs", "visibility", "public"]]
    assert board["shown"] == [["TEST DATA public fast", "/?run=run-public-fast"], ["TEST DATA public slow", "/?run=run-public-slow"]]
    assert board["meta"] == "2 runs"
    for hidden in ("private", "followers", "friends", "anonymous", "other segment"):
        assert "TEST DATA " + hidden not in board["text"]
    # Saved rows. The import row moved to site/import-row.js (4142271); the typed form still builds
    # its row in the page. Both send the three segment columns only when they are set.
    built = json.loads(subprocess.check_output(["node", "-e", r"""
const fs=require('fs'),vm=require('vm');
const {build}=require('./site/import-row.js');
const index=fs.readFileSync('site/index.html','utf8');
const start=index.indexOf('function dropNullSegmentColumns(row){');
const ctx={};vm.createContext(ctx);vm.runInContext(index.slice(start,index.indexOf('\n}\n',start)+2),ctx);
const opts={profileId:'fixture-owner',title:'TEST DATA',project:null};
const pick=row=>Object.fromEntries(['segment_id','wall_time_s','model'].filter(k=>k in row).map(k=>[k,row[k]]));
process.stdout.write(JSON.stringify({
 set:pick(build({segment_id:'segment-01',wall_time_s:45,model:'TEST DATA model'},opts)),
 zero:pick(build({segment_id:'segment-01',wall_time_s:0},opts)),
 unset:pick(build({},opts)),
 bad:pick(build({segment_id:'',wall_time_s:-1},opts)),
 fraction:pick(build({wall_time_s:1.5},opts)),
 text:pick(build({wall_time_s:'45'},opts)),
 visibility:build({segment_id:'segment-01'},opts).visibility,
 manualSet:pick(ctx.dropNullSegmentColumns({title:'t',segment_id:'segment-01',wall_time_s:0,model:'m'})),
 manualUnset:Object.keys(ctx.dropNullSegmentColumns({title:'t',segment_id:null,wall_time_s:null,model:null})),
}));
"""], cwd=ROOT, text=True))
    assert built == {
        "set": {"segment_id": "segment-01", "wall_time_s": 45, "model": "TEST DATA model"},
        "zero": {"segment_id": "segment-01", "wall_time_s": 0},  # a measured zero is kept, not dropped
        "unset": {},
        "bad": {},
        "fraction": {},
        "text": {},
        "visibility": "private",  # choosing a segment never publishes the run
        "manualSet": {"segment_id": "segment-01", "wall_time_s": 0, "model": "m"},
        "manualUnset": ["title"],
    }
    manual = index[index.index("function postComposerHtml("):index.index("async function viewPost()")]
    assert 'id="f_segment"' not in manual and 'id="f_wall"' not in manual
    # Manual updates cannot supply a model or measured segment duration.
    row = json.loads(subprocess.check_output(["node", "-e", "console.log(JSON.stringify(require('./site/project-update.js').row({title:'Synthetic',project:'P',changed:'Result',link:'https://example.com'})))"], cwd=ROOT, text=True))
    assert "segment_id" not in row and row["wall_time_s"] is None and row["model"] is None
    assert 'id="i_segment"' not in index[index.index("async function importRun(){"):]
    # The old helper remains; every captured import insert goes through StriveImportRow.build.
    assert index.count("dropNullSegmentColumns(") == 1
    imports = index[index.index("async function importRun(){"):]
    save = imports[imports.index("const row=StriveImportRow.build(run,{profileId:ME.id,"):]
    assert save.index("const row=StriveImportRow.build(") < save.index("await sb.from('runs').insert(row).select('id').single()")
    assert imports.count("sb.from('runs').insert(") == 1
