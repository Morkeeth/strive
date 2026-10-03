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
 def test_conflicting_overlap_and_duplicate_requests_refused(self):
  p=copy.deepcopy(self.page);p['records'][0]['role']='assistant'
  with self.assertRaises(ValueError):self.capture([self.page,p])
  p=copy.deepcopy(self.page);p['records'][1]['blocks']*=2
  with self.assertRaises(ValueError):self.capture([p])
if __name__=='__main__':unittest.main()
