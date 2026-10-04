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
