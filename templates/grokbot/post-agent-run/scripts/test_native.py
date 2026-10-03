"""Synthetic native ReadTranscript shapes. Offline, no native access claim."""
import copy,json,tempfile,unittest,subprocess,sys
from pathlib import Path
from preview import public_metrics
from upload import upload_payload

class NativeContract(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.path=Path(self.tmp.name)/'native.jsonl'
  self.bounds={'session_id':'synthetic-session','start_position':10,'end_position':12}
  self.rows=[{'position':10,'record':{'role':'user','message':{'content':[{'type':'text','text':'PRIVATE task'}]}}},
   {'position':11,'record':{'role':'assistant','message':{'content':[{'type':'text','text':'PRIVATE reply'},{'type':'tool_use','id':'a','name':'Shell','input':{'command':'PRIVATE command'}}]}}},
   {'position':12,'record':{'role':'tool','message':{'content':[{'type':'tool_result','tool_use_id':'a','content':'PRIVATE result'}]}}}]
 def measure(self,rows=None,bounds=None):
  self.path.write_text('\n'.join(json.dumps(x) for x in (self.rows if rows is None else rows)))
  return public_metrics(self.path,format='native',bounds=bounds or self.bounds)
 def test_native_preserves_unknowns_and_counts_tool_requests(self):
  m=self.measure();self.assertEqual(m['tool_calls'],1);self.assertEqual(sum(m['ridge']),1)
  self.assertEqual(m['trace_basis'],'timestamps unavailable');self.assertEqual(m['ridge_basis'],'turn-order')
  for k in ['turns_typed','started','duration_s','wall_time_s','recorded_user_messages']:self.assertNotIn(k,m)
  self.assertNotIn('PRIVATE',json.dumps(m))
 def test_native_tool_result_forms_preserve_payload_without_interpreting_it(self):
  expected=self.measure()
  for result in ['raw result', {'status':'opaque'}, [{'type':'text','text':'opaque'}]]:
   rows=copy.deepcopy(self.rows);block=rows[2]['record']['message']['content'][0];del block['content'];block['result']=result
   measured=self.measure(rows);self.assertEqual(measured['tool_calls'],expected['tool_calls']);self.assertEqual(measured['ridge'],expected['ridge'])
  for result in [None, True, 7]:
   rows=copy.deepcopy(self.rows);block=rows[2]['record']['message']['content'][0];del block['content'];block['result']=result
   with self.assertRaises(ValueError):self.measure(rows)
  rows=copy.deepcopy(self.rows);rows[2]['record']['message']['content'][0]['result']='ambiguous'
  with self.assertRaises(ValueError):self.measure(rows)
 def test_order_duplicate_overlap_and_source_identity(self):
  a=self.measure();self.assertEqual(a,self.measure(list(reversed(self.rows))+[self.rows[1]]))
  rows=copy.deepcopy(self.rows);rows[0]['record']['message']['content'][0]['text']='different'
  self.assertNotEqual(a['measurement_revision'],self.measure(rows)['measurement_revision'])
  bounds=dict(self.bounds,session_id='another-session')
  self.assertNotEqual(a['measurement_revision'],self.measure(bounds=bounds)['measurement_revision'])
 def test_gaps_conflicts_and_out_of_bounds_refused(self):
  conflict=copy.deepcopy(self.rows[0]);conflict['record']['role']='assistant'
  for rows in [self.rows[1:],self.rows+[conflict],self.rows+[dict(self.rows[0],position=13)]]:
   with self.assertRaises(ValueError):self.measure(rows)
 def test_ambiguous_and_incomplete_records_refused(self):
  for record in [{'role':'system','message':{'content':[]}}, {'role':'assistant','message':{'content':[{'type':'tool_use','name':'Shell'}]}}, {'role':'user','message':{'content':'plain'}}, {'role':'assistant','message':{'content':[{'type':'mystery'}]}}]:
   rows=copy.deepcopy(self.rows);rows[1]['record']=record
   with self.assertRaises(ValueError):self.measure(rows)
 def test_no_tool_activity_and_invalid_bounds_refused(self):
  with self.assertRaises(ValueError):self.measure(self.rows[:1],dict(self.bounds,end_position=10))
  with self.assertRaises(ValueError):self.measure(bounds=dict(self.bounds,start_position=True))
 def test_preview_upload_identity_and_no_private_counts(self):
  m=self.measure();u=upload_payload(self.path,format='native',bounds=self.bounds)
  self.assertEqual(m['measurement_revision'],u['measurement_revision']);self.assertNotIn('recorded_user_messages',u)
 def test_sample_cannot_upload(self):
  self.rows[0]['record']['agentgrinder_sample']=True;self.measure()
  with self.assertRaises(ValueError):upload_payload(self.path,format='native',bounds=self.bounds)
 def test_cli_receipt_and_dry_run_are_private_by_default(self):
  self.measure();bounds=Path(self.tmp.name)/'bounds.json';bounds.write_text(json.dumps(self.bounds))
  scripts=Path(__file__).parent
  args=[str(self.path),'--format','native','--bounds',str(bounds)]
  preview=subprocess.run([sys.executable,str(scripts/'preview.py'),*args],capture_output=True,text=True)
  self.assertEqual(preview.returncode,0,preview.stderr);receipt=json.loads(preview.stdout)
  self.assertEqual(receipt['native_capture']['recorded_user_messages'],1)
  self.assertNotIn('PRIVATE',preview.stdout)
  upload=subprocess.run([sys.executable,str(scripts/'upload.py'),*args,'--dry-run'],capture_output=True,text=True)
  self.assertEqual(upload.returncode,0,upload.stderr);payload=json.loads(upload.stdout)['payload']
  self.assertEqual(payload['measurement_revision'],receipt['metrics']['measurement_revision'])
  self.assertNotIn('turns_typed',payload);self.assertNotIn('PRIVATE',upload.stdout)
 def test_truncated_json_refused_without_skipping(self):
  self.measure();self.path.write_text(self.path.read_text()+'\n{"position":')
  with self.assertRaises(ValueError):public_metrics(self.path,format='native',bounds=self.bounds)
if __name__=='__main__':unittest.main()
