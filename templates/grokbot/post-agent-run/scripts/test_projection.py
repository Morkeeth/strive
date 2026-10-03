"""Synthetic observable API projections, no native-access claim."""
import copy,json,tempfile,unittest
from pathlib import Path
from preview import parse_projection
from upload import upload_payload
class ProjectionContract(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.path=Path(self.tmp.name)/'pages.jsonl'
  self.bounds={'agent_id':'actual-fixture-agent','conversation':'current','start_position':0,'end_position':2,'source':'ReadTranscript','content':'redacted projection','completeness':'not certified'}
  self.page={'start_position':0,'end_position':2,'total':10,'order':'oldest-first','records':[{'role':'user','blocks':[{'type':'text'}]},{'role':'assistant','blocks':[{'type':'tool_use','id':'call-a','name':'Shell'}]},{'role':'tool','blocks':[{'type':'tool_result','tool_use_id':'call-a'}]}]}
 def capture(self,pages=None):
  self.path.write_text('\n'.join(json.dumps(p) for p in (pages or [self.page])));return parse_projection(self.path,self.bounds)
 def test_observed_lower_bound_and_unknowns(self):
  m,r=self.capture();self.assertEqual(m['tool_calls'],1);self.assertEqual(sum(m['ridge']),1);self.assertIn('lower bound',r['count_basis']);self.assertNotIn('session_id',r)
  for k in ['prompts','turns_typed','started','duration_s','worker_bins','commits']:self.assertNotIn(k,m)
  p=upload_payload(self.path,format='projection',bounds=self.bounds);self.assertIn('Observed bot activity',p['title']);self.assertIn('lower bound',p['caption'])
 def test_range_order_overlap_identity(self):
  a,_=self.capture();p=copy.deepcopy(self.page);p['order']='newest-first';p['records'].reverse();b,_=self.capture([p,p]);self.assertEqual(a,b)
  p['records'][1]['blocks'][0]['id']='another';c,_=self.capture([p]);self.assertNotEqual(a['measurement_revision'],c['measurement_revision'])
 def test_incomplete_or_private_bodies_refused(self):
  variants=[]
  p=copy.deepcopy(self.page);p['records'].pop();variants.append(p)
  p=copy.deepcopy(self.page);p['records'][0]['blocks'][0]['text']='PRIVATE';variants.append(p)
  p=copy.deepcopy(self.page);del p['records'][1]['blocks'][0]['id'];variants.append(p)
  p=copy.deepcopy(self.page);p['order']='unknown';variants.append(p)
  p=copy.deepcopy(self.page);p['start_position']=1;p['end_position']=3;variants.append(p)
  for p in variants:
   with self.assertRaises(ValueError):self.capture([p])
 def test_partial_mode_is_explicit_and_gaps_are_not_zero_bins(self):
  left=copy.deepcopy(self.page);left['end_position']=0;left['records']=left['records'][:1]
  right=copy.deepcopy(self.page);right['start_position']=2;right['records']=[copy.deepcopy(self.page['records'][1])]
  self.path.write_text('\n'.join(json.dumps(p) for p in [left,right]))
  with self.assertRaises(ValueError):parse_projection(self.path,self.bounds)
  m,r=parse_projection(self.path,self.bounds,allow_missing_positions=True)
  self.assertEqual(r['missing_positions'],[1]);self.assertEqual(r['observed_positions'],[0,2])
  self.assertEqual(r['ridge_basis_detail'],'observed message order; missing positions omitted, not zero activity')
  self.assertEqual(m['ridge'][25],1) # second of two observed records, not third of three source positions
  self.assertEqual(sum(m['ridge']),1)
  complete,_=self.capture();self.assertNotEqual(m['measurement_revision'],complete['measurement_revision'])
  from preview import public_metrics
  with self.assertRaises(ValueError):public_metrics(self.path,format='native',bounds=self.bounds,allow_missing_positions=True)
  p=upload_payload(self.path,format='projection',bounds=self.bounds,allow_missing_positions=True)
  self.assertEqual(p['trace_basis'],m['trace_basis'])
 def test_partial_deduplicates_exact_request_ids_but_rejects_conflicts(self):
  page=copy.deepcopy(self.page);page['records'][2]={'role':'assistant','blocks':copy.deepcopy(page['records'][1]['blocks'])}
  self.path.write_text(json.dumps(page))
  with self.assertRaises(ValueError):parse_projection(self.path,self.bounds)
  m,r=parse_projection(self.path,self.bounds,allow_missing_positions=True)
  self.assertEqual(m['tool_calls'],1);self.assertEqual(r['duplicate_request_positions'],[{'first_position':1,'duplicate_position':2}])
  page['records'][2]['blocks'][0]['name']='different'
  self.path.write_text(json.dumps(page))
  with self.assertRaises(ValueError):parse_projection(self.path,self.bounds,allow_missing_positions=True)
 def test_conflicting_overlap_and_duplicate_requests_refused(self):
  p=copy.deepcopy(self.page);p['records'][0]['role']='assistant'
  with self.assertRaises(ValueError):self.capture([self.page,p])
  p=copy.deepcopy(self.page);p['records'][1]['blocks']*=2
  with self.assertRaises(ValueError):self.capture([p])
if __name__=='__main__':unittest.main()
