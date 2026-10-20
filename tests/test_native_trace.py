import json
from agentgrinder.native_trace import codex_activity


def test_native_authorship_and_time_not_json_format(tmp_path):
    p=tmp_path/'native.jsonl'
    events=[('user_message',{'message':'go'}),('user_message',{'message':'<environment_context>injected'}),('function_call',{'call_id':'one'}),('function_call_output',{'call_id':'one'}),('user_message',{'message':'next'})]
    p.write_text('\n'.join(json.dumps({'type':'event_msg' if typ=='user_message' else 'response_item','timestamp':f'2026-09-04T10:00:{i*3:02d}Z','payload':dict(type=typ,**data)}) for i,(typ,data) in enumerate(events)))
    run=codex_activity(p)
    assert run['typed']==2 and run['tools']==1
    assert run['authorship']['injected']==1
    assert run['trace']==[{'second':0,'kind':'human'},{'second':6,'kind':'tool'},{'second':12,'kind':'human'}]


def test_delegated_task_not_human(tmp_path):
    p=tmp_path/'lane.jsonl'
    p.write_text('\n'.join(json.dumps(r) for r in [{'type':'session_meta','payload':{'source':{'subagent':{'parent':'p'}}}},{'type':'event_msg','payload':{'type':'user_message','message':'delegated task'}}]))
    assert codex_activity(p)['authorship']=={'human':0,'injected':0,'delegated':1}


def test_codex_provenance_dedupes_record_shapes_and_excludes_agent_context(tmp_path):
    p=tmp_path/'mixed.jsonl'
    rows=[
        {'type':'session_meta','payload':{'source':'desktop'}},
        {'type':'event_msg','timestamp':'2026-10-20T10:00:00Z','payload':{'type':'user_message','message':'real request'}},
        {'type':'response_item','timestamp':'2026-10-20T10:00:00Z','payload':{'type':'message','role':'user','content':[{'type':'input_text','text':'real request'}]}},
        {'type':'event_msg','timestamp':'2026-10-20T10:00:01Z','payload':{'type':'user_message','message':'# AGENTS.md instructions\n<INSTRUCTIONS>injected</INSTRUCTIONS>'}},
    ]
    p.write_text('\n'.join(json.dumps(row) for row in rows))
    run=codex_activity(p)
    assert run['typed']==1
    assert run['authorship']['injected']==1
    assert run['prompt_provenance']['counts']['human-typed']==1
    assert sum(run['prompt_provenance']['counts'].values())==1
