"""The orchestration tree renders through the same runCard as a plain run, and only when asked."""
import json
import re
import subprocess
from pathlib import Path

from agentgrinder import privacy

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = json.loads((ROOT / 'samples/tree-sample.json').read_text())

RENDER = r'''
const fs=require('fs'),vm=require('vm');
const root=process.argv[1],sample=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const {ctx:context}=require(root+'/tests/site-card-context.cjs')(root);
const base={id:'r1',profile_id:'p1',created_at:'2026-09-14T00:00:00Z',title:'Plain run',started_at:'2026-09-14T00:00:00Z',duration_s:600,prompts:3};
const plain=vm.runInContext('runCard('+JSON.stringify(base)+',false,0)',context);
const withTree=vm.runInContext('runCard('+JSON.stringify({...base,tree:sample.tree})+',false,0)',context);
const preview=vm.runInContext('runCard('+JSON.stringify({...base,tree:sample.tree})+',false,0,{preview:true})',context);
const owner=vm.runInContext('runCard('+JSON.stringify(base)+',false,0,{ownerActions:true})',context);
const empty=vm.runInContext('runCard('+JSON.stringify({...base,tree:{...sample.tree,children:[]}})+',false,0)',context);
process.stdout.write(JSON.stringify({plain,withTree,preview,owner,empty}));
'''


def render():
    result = subprocess.run(['node', '-e', RENDER, str(ROOT), str(ROOT / 'samples/tree-sample.json')],
                            check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def test_card_without_tree_is_unchanged():
    out = render()
    assert 'class="tree"' not in out['plain']
    assert 'tree-' not in out['plain']
    # Remove the complete tree node, not the first unrelated closing section.
    script = "const {JSDOM}=require('jsdom');const x=JSON.parse(process.argv[1]);const normal=s=>new JSDOM(s).window.document.body;const a=normal(x.withTree),b=normal(x.plain);a.querySelector('section.tree').remove();const compact=n=>n.outerHTML.replace(/>\\s+</g,'><');process.stdout.write(JSON.stringify({same:compact(a)===compact(b)}));"
    compared = subprocess.check_output(['node', '-e', script, json.dumps(out)], cwd=ROOT, text=True)
    assert json.loads(compared)['same'] is True



def test_tree_renders_orchestrator_then_workers():
    out = render()
    html = out['withTree']
    workers = SAMPLE['tree']['children']
    assert html.count('class="tree-worker"') == len(workers) == 14
    assert html.index('tree-root') < html.index('tree-worker')
    for worker in workers:
        assert '>' + worker['model'] + '<' in html
    assert 'Tokens are not on disk' in html
    assert html.count('tree-bar') == len(workers)
    widths = [int(w) for w in re.findall(r'width:(\d+)%', html)]
    assert max(widths) == 100 and min(widths) >= 1 and len(widths) == len(workers)
    assert 'aborted' in html  # one worker in the sample was aborted; the flag stays visible
    assert 'Preview · not saved' in out['preview'] and 'ACK' not in out['preview'].split('tree-foot')[1]


def test_owner_run_card_renders_direct_edit_and_photo_actions():
    out = render()
    assert 'href="#run-edit">Edit run</a>' in out['owner']
    assert 'href="#run-photos">Add photos</a>' in out['owner']
    assert 'href="#run-edit">Edit run</a>' not in out['plain']


def test_tree_with_no_workers_says_so_instead_of_inventing_rows():
    out = render()
    assert 'Delegation recorded, no worker rows found.' in out['empty']
    assert 'tree-worker' not in out['empty']


def test_rendered_tree_and_fixture_pass_the_privacy_control():
    out = render()
    privacy.assert_clean(out['withTree'], 'tree card')
    text = (ROOT / 'samples/tree-sample.json').read_text()
    assert not privacy.scan(text)
    assert SAMPLE['is_sample'] is True and SAMPLE['redacted'] is True
    assert 'tokens' in SAMPLE['tree'] and SAMPLE['tree']['tokens'] is None
    for key in ['name', 'text', 'richText', 'rawArgs']:
        assert key not in json.dumps(SAMPLE['tree'])


def test_site_copy_matches_the_labelled_sample():
    assert (ROOT / 'site/tree-sample.json').read_bytes() == (ROOT / 'samples/tree-sample.json').read_bytes()


def test_sample_route_is_wired():
    html = (ROOT / 'site/index.html').read_text()
    assert "q.get('example')==='tree'" in html and 'GrinderExample.viewTree()' in html
    assert 'viewTree' in (ROOT / 'site/example.js').read_text()


def test_new_text_follows_the_writing_rules():
    """Only the text this spike added. Older lines in the edited files are not in scope."""
    whole = ['agentgrinder/cursor_tree.py', 'samples/tree-sample.json', 'tests/test_cursor_tree.py', 'tests/test_tree_card.py']
    slices = {'site/run-contract.js': ('/* Orchestration tree:', 'const api ='),
              'site/example.js': ('/* /?example=tree:', 'root.GrinderExample'),
              'site/design.css': ('/* Orchestration tree on a run card', None)}
    texts = [(ROOT / path).read_text() for path in whole]
    for path, (start, end) in slices.items():
        text = (ROOT / path).read_text()
        texts.append(text[text.index(start):text.index(end) if end else None])
    for text in texts:
        assert '\u2014' not in text
        assert not re.search(r'\w \u2013 \w', text)
        assert not re.search(r"(?i)\bnot [^.]{1,40}, it'?s\b", text)
