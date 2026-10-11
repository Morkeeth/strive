"""Same capture measurements across a bounded sitting; original-byte provenance."""
import hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from agentgrinder import plugin,stream_capture as stream

class StreamTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.path=self.root/'native.jsonl'
  self.rows=[{'type':'session_meta','timestamp':'2026-10-11T07:00:00Z','payload':{'id':'native-proof','source':'exec'}},
   {'type':'event_msg','timestamp':'2026-10-11T07:00:01Z','payload':{'type':'user_message','message':'FIRST PRIVATE PROMPT'}},
   {'type':'response_item','timestamp':'2026-10-11T07:00:02Z','payload':{'type':'function_call','name':'exec_command','arguments':'{"cmd":"pwd"}'}},
   {'type':'event_msg','timestamp':'2026-10-11T08:00:01Z','payload':{'type':'user_message','message':'SECOND PRIVATE PROMPT'}},
   {'type':'response_item','timestamp':'2026-10-11T08:00:02Z','payload':{'type':'function_call','name':'exec_command','arguments':'{"cmd":"ls"}'}}]
  self.path.write_text('\n'.join(map(json.dumps,self.rows)))
 def tearDown(self):self.temp.cleanup()
 def capture(self,name):
  root=self.root/name;db=plugin.connect(root);plugin.project(db,'Example',self.root)
  try:return plugin.capture(db,root,'Example','codex',self.path,1)
  finally:db.close()
 def test_same_measured_payload_original_hash_and_private(self):
  original=self.path.read_bytes();ordinary=self.capture('normal')
  with patch.object(plugin,'MAX_SOURCE',600):bounded=self.capture('bounded')
  self.assertEqual(ordinary['payload'],bounded['payload'])
  self.assertEqual(bounded['selection']['sha256'],hashlib.sha256(original).hexdigest())
  self.assertEqual(bounded['selection']['skipped_sittings'],1)
  self.assertEqual(self.path.read_bytes(),original)
  self.assertEqual(bounded['payload']['visibility'],'private');self.assertEqual(bounded['uploaded'],0)
  self.assertNotIn('PRIVATE PROMPT',json.dumps(bounded));self.assertNotIn(str(self.root),json.dumps(bounded))
 def test_no_partial_preview_when_selected_limit_exceeded(self):
  with patch.object(stream,'MAX_SELECTED',10):
   with self.assertRaisesRegex(ValueError,'No run was truncated'):
    with stream.selected_source(self.path,'codex',1):self.fail('yielded a partial selection')
 def test_source_and_record_limits(self):
  with patch.object(stream,'MAX_SOURCE',10):
   with self.assertRaisesRegex(ValueError,'2 GiB'):stream.inspect_source(self.path,'codex')
  with patch.object(stream,'MAX_RECORD',10):
   with self.assertRaisesRegex(ValueError,'record exceeds'):list(stream.records(self.path))
 def test_reject_changed_source_and_incomplete_record(self):
  original=stream.signature(self.path)
  with patch.object(stream,'signature',side_effect=[original,(*original[:3],original[3]+1)]):
   with self.assertRaisesRegex(ValueError,'changed while reading'):stream.inspect_source(self.path,'codex')
  self.path.write_text('{"unfinished":')
  with self.assertRaisesRegex(ValueError,'incomplete record'):stream.inspect_source(self.path,'codex')
 def test_claude_sitting_has_first_human_and_sorted_end(self):
  self.rows=[{'sessionId':'claude-proof','type':'user','promptSource':'typed','timestamp':'2026-10-11T00:00:00Z','message':{'content':'First'}},
   {'sessionId':'claude-proof','type':'assistant','timestamp':'2026-10-11T00:10:00Z','message':{'content':'Done'}},
   {'sessionId':'claude-proof','type':'user','promptSource':'typed','timestamp':'2026-10-11T01:00:00Z','message':{'content':'Next'}}]
  self.path.write_text('\n'.join(map(json.dumps,reversed(self.rows))))
  info=stream.inspect_source(self.path,'claude');self.assertEqual(len(info['sittings']),2)
  with stream.selected_source(self.path,'claude',1) as selected:
   rows=list(stream.records(selected['path']));self.assertEqual(len(rows),2)
   self.assertFalse(any(row['message']['content']=='Next' for _,row,_ in rows))

if __name__=='__main__':unittest.main()
