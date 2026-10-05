import json
from agentgrinder.capture import connect, scan


def transcript(tmp_path):
    p = tmp_path/'session.jsonl'
    p.write_text(json.dumps({'type':'event_msg','timestamp':'2026-09-04T10:00:00Z','payload':{'type':'user_message','message':'go'}})+'\n')
    return p


def test_capture_dedup_pause_ignore_and_update(tmp_path):
    p=transcript(tmp_path)
    db=connect(tmp_path/'private')
    source=[('codex',p)]
    assert scan(db,source)['created']==1
    assert scan(db,source)['unchanged']==1
    with p.open('a') as f:
        f.write(json.dumps({'type':'response_item','timestamp':'2026-09-04T10:00:02Z','payload':{'type':'function_call','call_id':'c1','name':'test'}})+'\n')
    assert scan(db,source)['updated']==1
    assert db.execute('select count(*) from drafts').fetchone()[0]==1
    assert json.loads(db.execute('select payload from drafts').fetchone()[0])['tool_calls']==1
    db.execute("insert into settings values('paused','true')")
    assert scan(db,source)['paused']
    db.execute("update settings set value='false'")
    db.execute('insert into ignored values(?)',(str(tmp_path),))
    assert scan(db,source)['ignored']==1
    db.close()


def test_moving_transcript_does_not_create_false_snapshot(tmp_path,monkeypatch):
    from agentgrinder import capture
    p=transcript(tmp_path)
    original=capture.read_run
    def read(*args,**kwargs):
        run=original(*args,**kwargs)
        with p.open('a') as f:f.write('\n')
        return run
    monkeypatch.setattr(capture,'read_run',read)
    db=connect(tmp_path/'private')
    assert scan(db,[('codex',p)])['retry']==1
    assert db.execute('select count(*) from drafts').fetchone()[0]==0
    db.close()


def test_a_session_with_no_typed_turns_is_reported_not_silent(tmp_path):
    p=tmp_path/'unattended.jsonl'
    p.write_text(json.dumps({'type':'assistant','timestamp':'2026-09-04T10:00:00Z','message':{'role':'assistant','content':[{'type':'tool_use','id':'t1','name':'Bash','input':{}}]}})+'\n')
    db=connect(tmp_path/'private')
    report=scan(db,[('claude',p)])
    assert report['created']==0 and report['no_typed_turns']==1
    assert report['skipped']==[{'session':'unattended','harness':'claude','reason':'no typed turns, so no draft; agentgrinder agent capture can measure it only if the transcript carries SDK or sidechain provenance'}]
    db.close()


def test_day_page_lists_only_that_local_day_and_uploads_nothing(tmp_path,monkeypatch):
    import base64,re,urllib.parse
    from datetime import datetime
    from agentgrinder.capture import write_day
    import agentgrinder.capture as capture
    db=connect(tmp_path/'private')
    p=transcript(tmp_path)
    assert scan(db,[('codex',p)])['created']==1
    started=datetime.fromisoformat(db.execute('select started from drafts').fetchone()[0].replace('Z','+00:00')).astimezone()
    day=started.strftime('%Y-%m-%d')
    import socket
    def no_network(*a,**k): raise AssertionError('the day page must not open a network connection')
    monkeypatch.setattr(socket,'socket',no_network);monkeypatch.setattr(socket,'create_connection',no_network)
    from agentgrinder.capture import session_tag
    assert session_tag('/x/rollout-2026-10-05T10-00-00-01a1077f-6c64-7792-8175-a59a0871ddb4.jsonl')=='01a1077f' and session_tag('/x/session.jsonl')=='unknown'
    out=tmp_path/'day.html'
    result=write_day(db,day,str(out),'TEST DATA label','http://localhost:8000')
    assert result=={'day':day,'drafts':1,'other_days':0,'project':'TEST DATA label','written':str(out),'uploaded':0}
    page=out.read_text()
    assert 'TEST DATA label' in page and 'Nothing has been uploaded' in page and oct(out.stat().st_mode)[-3:]=='600'
    token=re.search(r'#import=([^"]+)"',page).group(1)
    sent=json.loads(base64.b64decode(urllib.parse.unquote(token)))
    assert sent['project']=='TEST DATA label' and str(tmp_path) not in json.dumps(sent) and str(tmp_path) not in page
    assert write_day(db,'2001-01-01',str(tmp_path/'none.html'))['drafts']==0 and write_day(db,'2001-01-01',str(tmp_path/'none.html'))['other_days']==1
    import pytest
    with pytest.raises(ValueError): write_day(db,'5 Oct',str(out))
    with pytest.raises(ValueError): write_day(db,day,str(out),' ')
    db.close()
