import hashlib
import json
from pathlib import Path
import subprocess

import pytest
from agentgrinder import route_capture as route
from agentgrinder import plugin


def command(repo,*args):
    return subprocess.check_output(['git','-C',str(repo),*args],stderr=subprocess.DEVNULL).decode().strip()


def setup(tmp_path):
    repo=tmp_path/'repo';repo.mkdir()
    command(repo,'init');command(repo,'config','user.name','Fixture');command(repo,'config','user.email','fixture@example.invalid')
    (repo/'work.py').write_text('before\n');command(repo,'add','work.py');command(repo,'commit','-m','baseline')
    source=tmp_path/'session.jsonl'
    source.write_text(json.dumps({'type':'session_meta','payload':{'id':'test-session','source':{'subagent':{'parent_thread_id':'parent'}},'cwd':str(repo)}})+'\n')
    root=tmp_path/'state'
    selected=[{'name':'Orchard','root':str(repo)}]
    start=route.start(root,selected,source,'codex',consent=True)
    return root,repo,source,start['capture'],selected


def append(source,call='new-call',stamp=None):
    with source.open('a') as stream:
        stream.write(json.dumps({'type':'response_item','timestamp':stamp or route.now(),'payload':{'type':'function_call','call_id':call,'name':'exec','arguments':'PRIVATE SENTINEL /Users/owner/secrets'}})+'\n')


def edit(root,repo,source,capture):
    (repo/'work.py').write_text('after\n');append(source);route.checkpoint(root,capture)


def test_future_only_git_events_private_export_and_frozen_review(tmp_path,monkeypatch):
    root,repo,source,capture,_=setup(tmp_path)
    edit(root,repo,source,capture)
    command(repo,'add','work.py');command(repo,'commit','-m','PRIVATE SENTINEL');sha=command(repo,'rev-parse','HEAD')
    append(source,'second');route.checkpoint(root,capture)
    review=route.freeze(root,capture);payload=review['payload'];stops=payload['code_route']['stops']
    assert [s['kind'] for s in stops]==['edit','commit']
    assert stops[0]['label']=='1 tracked file change observed'
    assert stops[1]['label']=='1 commit recorded'
    assert stops[1]['evidence'][-1]=='Git commit: '+sha
    assert payload['tool_calls']==2 and payload['turns_typed']==0
    assert sum(payload['rhythm'])==2
    assert 'shipped_artifacts' not in payload['code_route']['stats']
    assert hashlib.sha256(Path(review['source']).read_bytes()).hexdigest()==review['source_sha256']
    exported=json.dumps(payload)
    assert str(tmp_path) not in exported and 'PRIVATE SENTINEL' not in exported and 'work.py' not in exported
    assert oct(Path(review['source']).stat().st_mode)[-3:]=='600'
    append(source,'later');(repo/'work.py').write_text('later')
    assert route.freeze(root,capture)==review
    with pytest.raises(ValueError,match='closed'):route.checkpoint(root,capture)
    db=plugin.connect(root);draft=plugin.capture_route(db,root,capture);again=plugin.capture_route(db,root,capture)
    assert draft['draft']==again['draft'] and draft['payload']['visibility']=='private'
    assert draft['payload']['code_route']==payload['code_route']
    frozen=plugin.review(db,root,[draft['draft']]);assert frozen['uploaded']==0
    assert json.loads(db.execute('select payload from reviews').fetchone()[0])['runs'][0]['code_route']==payload['code_route']


def test_no_consent_no_probe_and_no_active_overlap(tmp_path,monkeypatch):
    with pytest.raises(ValueError,match='consent'):
        route.start(tmp_path/'missing',[{'name':'Example','root':'/does/not/exist'}],'/does/not/exist','codex')
    assert not (tmp_path/'missing').exists()
    root,repo,source,capture,selected=setup(tmp_path)
    with pytest.raises(ValueError,match='active capture'):route.start(root,selected,source,'codex',True)


def test_no_checkpoint_no_fabricated_route_and_no_untracked_inference(tmp_path):
    root,repo,source,capture,_=setup(tmp_path)
    append(source);route.checkpoint(root,capture)
    with pytest.raises(ValueError,match='No post-consent'):route.freeze(root,capture)
    (repo/'unknown-before.py').write_text('already present outside tracked scope')
    command(repo,'add','unknown-before.py');route.checkpoint(root,capture)
    with pytest.raises(ValueError,match='No post-consent'):route.freeze(root,capture)
    state=json.loads((root/'routes'/capture/'journal.json').read_text())
    assert state['records'][-1]['scope_added']==['unknown-before.py']
    (repo/'unknown-before.py').write_text('an actual subsequent change');route.checkpoint(root,capture)
    assert route.freeze(root,capture)['payload']['code_route']['stats']['files_changed']==1


def test_simultaneous_edit_commit_is_one_observation(tmp_path):
    root,repo,source,capture,_=setup(tmp_path)
    (repo/'work.py').write_text('changed');command(repo,'add','work.py');command(repo,'commit','-m','change')
    append(source);route.checkpoint(root,capture)
    payload=route.freeze(root,capture)['payload'];stops=payload['code_route']['stops']
    assert len(stops)==1 and stops[0]['kind']=='commit'
    assert payload['code_route']['connectors']==[]


def test_delayed_preconsent_metadata_is_excluded(tmp_path):
    root,repo,source,capture,_=setup(tmp_path)
    with source.open('a') as stream:
        for row in [{'type':'turn_context','timestamp':'2000-01-01T00:00:00Z','payload':{'model':'old-model'}},
                    {'type':'event_msg','timestamp':'2000-01-01T00:00:00Z','payload':{'type':'token_count','info':{'total_token_usage':{'input_tokens':999,'output_tokens':5},'last_token_usage':{'input_tokens':999,'output_tokens':5}}}}]:
            stream.write(json.dumps(row)+'\n')
    append(source,'old-call','2000-01-01T00:00:00Z');edit(root,repo,source,capture)
    metrics=route.freeze(root,capture)['payload']
    assert metrics['tool_calls']==1
    assert metrics['capture_metadata']=={'models':[],'basis':'codex-records'}


def test_prefix_and_selected_source_reprojection_tampering_refused(tmp_path):
    root,repo,source,capture,_=setup(tmp_path)
    edit(root,repo,source,capture)
    review=route.freeze(root,capture)
    (root/'routes'/capture/'review-v2.json').unlink()
    original=source.read_bytes();source.write_bytes(original.replace(b'new-call',b'bad-call'))
    with pytest.raises(ValueError,match='selected native records changed'):route.freeze(root,capture)
    source.write_bytes(original.replace(b'test-session',b'lost-session'))
    with pytest.raises(ValueError,match='prefix changed'):route.freeze(root,capture)


def test_cli_route_capture_and_ordinary_capture_remain_separate(tmp_path,capsys):
    root,repo,source,capture,selected=setup(tmp_path)
    db=plugin.connect(root);plugin.project(db,'Orchard',repo);db.close()
    edit(root,repo,source,capture)
    assert plugin.main(['--state',str(root),'route-review',capture])==0
    reviewed=json.loads(capsys.readouterr().out)
    assert reviewed['payload']['code_route']['stops'][0]['evidence'][0]==route.MARKER
    assert reviewed['uploaded']==0
    assert plugin.main(['--state',str(root),'capture','--project','Orchard','--harness','codex','--source',str(source),'--code-route',capture])==0
    assert json.loads(capsys.readouterr().out)['draft']==reviewed['draft']
    assert plugin.main(['--state',str(root),'capture','--project','Orchard','--harness','codex','--source',str(source)])==1
    assert 'Child transcript excluded' in capsys.readouterr().err


def test_multiple_projects_observation_order_and_only_observed_scope(tmp_path):
    root,repo,source,capture,_=setup(tmp_path)
    second=tmp_path/'second';second.mkdir();command(second,'init');command(second,'config','user.name','Fixture');command(second,'config','user.email','fixture@example.invalid')
    (second/'x').write_text('before');command(second,'add','x');command(second,'commit','-m','baseline')
    root2=tmp_path/'multi';capture=route.start(root2,[{'name':'One','root':str(repo)},{'name':'Two','root':str(second)}],source,'codex',True)['capture']
    (repo/'work.py').write_text('changed');(second/'x').write_text('changed');append(source);route.checkpoint(root2,capture)
    data=route.freeze(root2,capture)['payload']['code_route']
    assert data['stats']['projects_touched']==2 and data['stats']['files_changed']==2
    assert [s['project'] for s in data['stops']]==['p1','p2']
    assert [s['evidence'][2] for s in data['stops']]==['Record: 3; order: 1; basis: checkpoint order','Record: 4; order: 2; basis: checkpoint order']
