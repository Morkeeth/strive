import importlib.util
import json
from pathlib import Path
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import uuid

import pytest
from agentgrinder import plugin


def selected(tmp_path, name='Orchard', session='s1'):
    root=tmp_path/'private';db=plugin.connect(root)
    repo=tmp_path/name;repo.mkdir(exist_ok=True)
    plugin.project(db,name,repo)
    path=tmp_path/(session+'.jsonl')
    rows=[{'type':'session_meta','payload':{'id':session,'cwd':str(repo)}},
          {'type':'event_msg','timestamp':'2026-10-08T10:00:00Z','payload':{'type':'user_message','message':'PRIVATE SENTINEL sk-secret@example.com /Users/private/token'}},
          {'type':'response_item','timestamp':'2026-10-08T10:00:02Z','payload':{'type':'function_call','call_id':'c1','name':'test','arguments':'PRIVATE SENTINEL'}}]
    path.write_text('\n'.join(map(json.dumps,rows))+'\n')
    result=plugin.capture(db,root,name,'codex',path)
    return root,db,path,result


def test_real_parser_selection_dedupe_and_privacy(tmp_path,monkeypatch):
    def offline(*a,**k): raise AssertionError('local capture attempted network')
    monkeypatch.setattr(socket,'create_connection',offline)
    root,db,path,result=selected(tmp_path)
    again=plugin.capture(db,root,'Orchard','codex',path)
    assert result['draft']==again['draft'] and again['status']=='unchanged'
    assert result['payload']['tool_calls']==1
    other=tmp_path/'copied.jsonl';other.write_bytes(path.read_bytes())
    assert plugin.capture(db,root,'Orchard','codex',other)['draft']==result['draft']
    reviewed=plugin.review(db,root,[result['draft']])
    output=Path(reviewed['file']).read_text()
    assert 'PRIVATE SENTINEL' not in output and '/Users/private' not in output and 'sk-secret' not in output
    assert str(tmp_path) not in output
    assert db.execute('select count(*) from drafts').fetchone()[0]==1
    assert oct((root/'plugin.db').stat().st_mode)[-3:]=='600'
    assert oct(Path(reviewed['file']).stat().st_mode)[-3:]=='600'
    assert not list(root.glob('strive-*')) # transient frozen raw bytes removed


def test_incomplete_and_child_sources_are_not_drafts(tmp_path):
    root,db,path,result=selected(tmp_path)
    with path.open('a') as f:f.write('{"partial":')
    with pytest.raises(ValueError,match='incomplete'):plugin.capture(db,root,'Orchard','codex',path)
    path.write_text(json.dumps({'type':'session_meta','payload':{'id':'child','source':{'subagent':{'parent_thread_id':'s1'}}}})+'\n')
    with pytest.raises(ValueError,match='Child'):plugin.capture(db,root,'Orchard','codex',path)
    assert db.execute('select count(*) from drafts').fetchone()[0]==1


def test_review_is_immutable_and_missing_counts_unknown(tmp_path):
    root,db,path,r=selected(tmp_path)
    payload=r['payload'];payload.pop('tool_calls');payload.pop('capture_metadata',None)
    db.execute('update drafts set payload=?',(json.dumps(payload),));db.commit()
    review=plugin.review(db,root,[r['draft']])
    assert review['projects']['Orchard']['tool_calls'] is None
    assert 'Tool calls not recorded' in Path(review['file']).read_text()
    frozen=db.execute('select payload from reviews').fetchone()[0]
    db.execute('delete from drafts');db.commit()
    assert db.execute('select payload from reviews').fetchone()[0]==frozen
    with pytest.raises(ValueError,match='Approve'):plugin.save(db,review['review'],'different','http://localhost')


def test_hooks_are_opt_in_bounded_and_keep_only_references(tmp_path):
    root,db,path,r=selected(tmp_path)
    event={'cwd':str(tmp_path/'Orchard'),'transcript_path':str(path),'prompt':'SECRET','model':'unproven-model','user_email':'private@example.com'}
    assert not plugin.hook(db,'claude',event)['queued']
    plugin.project(db,'Orchard',tmp_path/'Orchard',True)
    assert plugin.hook(db,'claude',event)['queued']
    assert plugin.hook(db,'claude',event)['queued']
    assert db.execute('select count(*) from queue').fetchone()[0]==1
    assert 'SECRET' not in str([tuple(r) for r in db.execute('select * from queue')])
    assert not plugin.hook(db,'claude',dict(event,agent_id='child'))['queued']
    plugin.project(db,'Orchard',tmp_path/'Orchard')
    assert not plugin.hook(db,'claude',event)['queued']


def test_ambiguous_save_retries_same_request_and_other_accounts_do_not_reuse_receipt(tmp_path):
    root,db,path,r=selected(tmp_path)
    reviewed=plugin.review(db,root,[r['draft']]);rid=reviewed['review']
    received=[];saved={};drop=[True]
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_POST(self):
            payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            key=self.headers['Idempotency-Key'];received.append((key,payload,self.headers['Authorization']))
            existing=key in saved
            saved.setdefault(key,str(uuid.uuid4()))
            if drop[0]:
                drop[0]=False;self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
            data=json.dumps({'id':saved[key],'existing':existing,'visibility':'private'}).encode()
            self.send_response(200);self.end_headers();self.wfile.write(data)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
    base='http://127.0.0.1:'+str(server.server_port)
    token='ag_'+str(uuid.uuid4())+str(uuid.uuid4())
    try:
        first=plugin.save(db,rid,rid,base,token)
        assert first['results'][0]['status'].startswith('unknown')
        second=plugin.save(db,rid,rid,base,token)
        assert second['results'][0]['existing'] is True
        assert len(saved)==1 and received[0][0]==received[1][0]
        assert received[0][1]['visibility']=='private'
        assert 'PRIVATE SENTINEL' not in json.dumps(received)
        plugin.save(db,rid,rid,base,token)
        assert len(received)==2 # resolved local receipt prevents a third send
        plugin.save(db,rid,rid,base,'ag_'+str(uuid.uuid4())+str(uuid.uuid4()))
        assert len(received)==3 and len(saved)==2 # different Connect identity is a different operation
    finally:server.shutdown();server.server_close()


def test_installer_is_contained_and_uninstall_preserves_other_plugins(tmp_path):
    spec=importlib.util.spec_from_file_location('installer',Path(__file__).parents[1]/'scripts/strive-plugin.py')
    installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
    config=tmp_path/'cursor';other=config/'plugins/local/other';other.mkdir(parents=True)
    (other/'keep').write_text('do not change')
    settings=config/'settings.json';settings.write_text('{"unrelated":true}')
    result=installer.install('cursor',config)
    target=Path(result['installed_files'])
    assert (target/'runtime/agentgrinder/plugin.py').is_file()
    assert (target/'.cursor-plugin/plugin.json').is_file() and (target/'.claude-plugin/plugin.json').is_file()
    with pytest.raises(ValueError,match='exists'):installer.install('cursor',config)
    installer.uninstall('cursor',config)
    assert not target.exists() and (other/'keep').read_text()=='do not change'
    assert settings.read_text()=='{"unrelated":true}'
    assert installer.install('cursor',config)['client_loaded'] is False


def test_default_claude_install_keeps_native_auth_location(tmp_path,monkeypatch):
    spec=importlib.util.spec_from_file_location('installer',Path(__file__).parents[1]/'scripts/strive-plugin.py')
    installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
    calls=[]
    monkeypatch.setattr(installer.subprocess,'run',lambda command,**kw:calls.append((command,kw)))
    monkeypatch.setenv('CLAUDE_CONFIG_DIR','/unrelated/override')
    installer.run_claude(Path.home()/'.claude','list')
    assert 'CLAUDE_CONFIG_DIR' not in calls[-1][1]['env']
    installer.run_claude(tmp_path/'isolated','list')
    assert calls[-1][1]['env']['CLAUDE_CONFIG_DIR']==str(tmp_path/'isolated')
