"""Offline capture identity checks for the standalone kit. No model or HTTP calls."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from preview import public_metrics
from upload import upload_payload

SAMPLE = Path(__file__).resolve().parents[1] / 'samples/sample_grokbot_bot_activity.jsonl'

class CaptureContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.rows = [json.loads(line) for line in SAMPLE.read_text().splitlines()]
        for row in self.rows:
            row.pop('agentgrinder_sample', None)

    def write(self, rows, name='run.jsonl'):
        p = Path(self.temp.name) / name
        p.write_text(''.join(json.dumps(row)+'\n' for row in rows))
        return p

    def test_preview_carries_capture_admission_and_matches_upload(self):
        p = self.write(self.rows)
        preview, upload = public_metrics(p), upload_payload(p)
        self.assertEqual(preview.get('schema_version'), 1)
        self.assertRegex(preview.get('measurement_revision',''), r'^[a-f0-9]{64}$')
        self.assertEqual(preview['measurement_revision'], upload['measurement_revision'])
        self.assertEqual(preview['measurement_revision'], public_metrics(p)['measurement_revision'])

    def test_different_sources_with_identical_counts_do_not_collide(self):
        other = copy.deepcopy(self.rows)
        other[0]['message']['content'][0]['text'] += '\nDifferent genuine session content'
        a,b = self.write(self.rows),self.write(other,'other.jsonl')
        self.assertEqual(public_metrics(a)['tool_calls'], public_metrics(b)['tool_calls'])
        self.assertNotEqual(upload_payload(a)['measurement_revision'], upload_payload(b)['measurement_revision'])

    def test_revision_ignores_path_and_whitespace_but_binds_selected_records(self):
        p = self.write(self.rows)
        q = Path(self.temp.name) / 'renamed.jsonl'
        q.write_text('\n'.join(json.dumps(row,separators=(',',':')) for row in self.rows))
        self.assertEqual(upload_payload(p)['measurement_revision'], upload_payload(q)['measurement_revision'])

    def test_public_payload_never_contains_source_text(self):
        text = json.dumps(public_metrics(self.write(self.rows)))
        for forbidden in ['SAMPLE/project','Creating the labelled','sample result','user_query']:
            self.assertNotIn(forbidden,text)

if __name__ == '__main__':
    unittest.main()
