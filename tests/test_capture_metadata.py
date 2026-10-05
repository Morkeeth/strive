from agentgrinder.capture_metadata import recorded, validate
from agentgrinder.push import export_run
import pytest

def event(total, inp=100, out=20):
 return {'type':'event_msg','payload':{'type':'token_count','info':{'total_token_usage':{'input_tokens':total,'output_tokens':total//5},'last_token_usage':{'input_tokens':inp,'output_tokens':out,'cached_input_tokens':60,'reasoning_tokens':5}}}}
def test_codex_deltas_dedup_and_mixed_models():
 rows=[{'type':'turn_context','payload':{'model':'model-a'}},event(1000),event(1000),{'type':'turn_context','payload':{'model':'model-b'}},event(1100)]
 m=recorded(rows,'codex'); assert m['models']==['model-a','model-b'];assert m['input_tokens']+m['output_tokens']==240
 assert m['cached_input_tokens']==120;assert m['reasoning_tokens']==10
 assert export_run({'capture_metadata':m})['capture_metadata']==m

def test_claude_stream_duplicates_and_separate_cache():
 def row(out):return {'type':'assistant','message':{'id':'same','model':'claude-x','usage':{'input_tokens':10,'cache_read_input_tokens':40,'cache_creation_input_tokens':20,'output_tokens':out}}}
 m=recorded([row(1),row(8)],'claude');assert m['input_tokens']==70;assert m['output_tokens']==8
 assert m['cached_input_tokens']==40

def test_missing_is_unknown_and_text_does_not_escape():
 m=recorded([{'type':'turn_context','payload':{'model':'x','instructions':'private text'}}, {'type':'event_msg','payload':{'type':'token_count','info':{'total_token_usage':{'input_tokens':99,'output_tokens':9}}}}],'codex')
 assert m=={'models':['x'],'basis':'codex-records'}
 assert recorded([{'modelConfig':{'modelName':'selected-not-observed'}}],'cursor')['models']==[]

def test_refuse_forged_shape_and_subsets():
 for m in [{'models':['a'],'basis':'codex-records','secret':'x'}, {'models':['a'],'basis':'codex-records','input_tokens':5,'cached_input_tokens':6}, {'models':['a'],'basis':'codex-records','output_tokens':True}]:
  with pytest.raises(ValueError):validate(m)

def test_malformed_usage_is_unknown_and_valid_recorded_subset_survives():
 bad=[{'type':'event_msg','payload':{'type':'token_count','info':[]}}, {'type':'event_msg','payload':{'type':'token_count','info':{'last_token_usage':'bad','total_token_usage':5}}}]
 assert 'input_tokens' not in recorded(bad,'codex')
 assert recorded(bad+[event(1000)],'codex')['input_tokens']==100
 assert 'input_tokens' not in recorded([{'type':'assistant','message':{'id':'x','model':'claude-x','usage':[]}}],'claude')

def codex_call(total_in, total_out, **usage):
 return {'type':'event_msg','payload':{'type':'token_count','info':{
  'total_token_usage':{'input_tokens':total_in,'output_tokens':total_out},
  'last_token_usage':usage}}}

def test_codex_reset_starts_new_dedup_epoch():
 call=codex_call(100,20,input_tokens=100,output_tokens=20)
 reset=codex_call(0,0,input_tokens=0,output_tokens=0)
 m=recorded([call,call,reset,call,call],'codex')
 assert m['input_tokens']==200 and m['output_tokens']==40

def test_codex_reset_without_usage_still_starts_an_epoch():
 call=codex_call(100,20,input_tokens=100,output_tokens=20)
 m=recorded([call,codex_call(0,0),call],'codex')
 assert m['input_tokens']==200 and m['output_tokens']==40

@pytest.mark.parametrize('bad',[
 {'input_tokens':10,'output_tokens':2,'cached_input_tokens':20},
 {'input_tokens':10,'output_tokens':2,'reasoning_tokens':3},
 {'input_tokens':10,'output_tokens':2,'cached_input_tokens':True},
 {'input_tokens':10,'output_tokens':2,'reasoning_tokens':-1},
 {'input_tokens':9007199254740991,'output_tokens':1},
 {'input_tokens':9007199254740992,'output_tokens':0},
 {'input_tokens':10,'output_tokens':2,'cached_input_tokens':9007199254740992},
])
def test_invalid_codex_call_is_discarded_before_aggregation(bad):
 invalid=codex_call(110,22,**bad)
 assert recorded([invalid],'codex')=={'models':[],'basis':'codex-records'}
 valid=codex_call(100,20,input_tokens=100,output_tokens=20,cached_input_tokens=0,reasoning_tokens=0)
 m=recorded([valid,invalid],'codex')
 assert m=={'models':[],'basis':'codex-records','input_tokens':100,'output_tokens':20,'cached_input_tokens':0,'reasoning_tokens':0}

@pytest.mark.parametrize('bad_id',[['invalid-id'],{'id':'invalid'},12,True,'','   ',None])
def test_malformed_claude_id_does_not_abort_valid_calls(bad_id):
 def row(key):return {'type':'assistant','message':{'id':key,'model':'claude-x','usage':{'input_tokens':10,'output_tokens':2}}}
 m=recorded([row(bad_id),row('valid-message')],'claude')
 assert m['input_tokens']==10 and m['output_tokens']==2

def test_claude_call_overflow_is_discarded():
 def row(key,inp,cache=0):return {'type':'assistant','message':{'id':key,'usage':{'input_tokens':inp,'output_tokens':2,'cache_read_input_tokens':cache}}}
 m=recorded([row('oversized',9007199254740991,1),row('valid',10)],'claude')
 assert m['input_tokens']==10 and m['output_tokens']==2

def test_unrepresentable_aggregate_is_unknown_without_losing_models():
 rows=[{'type':'turn_context','payload':{'model':'model-a'}},
  codex_call(100,20,input_tokens=9007199254740991,output_tokens=0),
  codex_call(200,40,input_tokens=1,output_tokens=0)]
 assert recorded(rows,'codex')=={'models':['model-a'],'basis':'codex-records'}
