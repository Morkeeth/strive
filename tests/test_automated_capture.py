import json
import pytest
from agentgrinder.automated_capture import capture
from agentgrinder.push import export_run
from agentgrinder.metrics import verified_per_turn


def rows():
    return [dict(type='user',promptSource='sdk',timestamp='2026-09-01T10:00:00Z',message={'content':'PRIVATE TASK'}),
            dict(type='assistant',timestamp='2026-09-01T10:01:00Z',message={'content':[{'type':'tool_use','id':'tool-1','name':'Write','input':{'file_path':'/private/project/a.py','content':'SECRET'}}]}),
            dict(type='user',timestamp='2026-09-01T10:02:00Z',message={'content':[{'type':'tool_result','tool_use_id':'tool-1','content':'failed','is_error':True}]})]


def write(tmp_path, data):
    p=tmp_path/'session.jsonl';p.write_text('\n'.join(map(json.dumps,data)));return str(p)


def test_agent_capture_counts_requests_not_success_or_human_input(tmp_path):
    data=rows();data.insert(2,data[1]) # duplicate transport record is one tool invocation
    run=capture(write(tmp_path,data))
    assert run['turns_typed'] is None and run['tool_calls']==1
    assert run['prompt_provenance']['counts']['unknown']==1
    assert run['prompt_provenance']['human_turns']==0
    assert sum(run['rhythm'])==1 and run['duration_s']==120
    assert run.get('commits') is None and run.get('artifacts_produced') is None
    assert run.get('claims_verified') is None
    assert verified_per_turn(1,1,run['turns_typed']) is None
    exported=json.dumps(export_run(run))
    assert all(x not in exported for x in ['PRIVATE','SECRET','/private','file_path'])
    assert len(run['measurement_revision'])==64
    assert capture(write(tmp_path,data))['measurement_revision']==run['measurement_revision']
    data[-1]['timestamp']='2026-09-01T10:03:00Z'
    assert capture(write(tmp_path,data))['measurement_revision']!=run['measurement_revision']


def test_sidechain_capture_records_known_zero_human_turns(tmp_path):
    data=rows();data[0]['isSidechain']=True
    run=capture(write(tmp_path,data))
    assert run['turns_typed']==0
    assert run['prompt_provenance']['counts']['agent-to-agent']==1


@pytest.mark.parametrize('source',['typed','queued',None,'unknown'])
def test_human_or_ambiguous_provenance_is_not_zero_human(tmp_path,source):
    data=rows();data[0]['promptSource']=source
    with pytest.raises(ValueError):capture(write(tmp_path,data))


def test_partial_or_undated_source_is_refused(tmp_path):
    path=write(tmp_path,rows());open(path,'a').write('\n{"partial":')
    with pytest.raises(ValueError,match='incomplete'):capture(path)
    data=rows();data[1]['timestamp']='2026-09-01T10:01:00'
    with pytest.raises(ValueError,match='timezone'):capture(write(tmp_path,data))
