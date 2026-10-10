import hashlib
import unittest

from agentgrinder.estimate_capture import estimate_inputs


class EstimateCaptureTest(unittest.TestCase):
    def test_claude_streaming_rows_and_tool_minute_share_one_selected_window(self):
        usage = {
            'input_tokens': 2, 'output_tokens': 187,
            'cache_read_input_tokens': 27139, 'cache_creation_input_tokens': 30063,
            'cache_creation': {'ephemeral_5m_input_tokens': 0,
                               'ephemeral_1h_input_tokens': 30063},
            'service_tier': 'standard',
        }
        rows = [
            {'type': 'assistant', 'timestamp': '2026-10-11T00:01:09Z',
             'message': {'id': 'msg-real-shape', 'model': 'claude-opus-5-5', 'usage': usage,
                         'content': [{'type': 'tool_use'}, {'type': 'tool_use'}]}},
            {'type': 'assistant', 'timestamp': '2026-10-11T00:01:11Z',
             'message': {'id': 'msg-real-shape', 'model': 'claude-opus-5-5', 'usage': usage,
                         'content': []}},
        ]
        meta = {'models': ['claude-opus-5-5'], 'input_tokens': 57204,
                'output_tokens': 187, 'cached_input_tokens': 27139}
        result = estimate_inputs(rows, 'claude', b'selected source', meta,
                                 started='2026-10-11T00:01:00+00:00',
                                 ended='2026-10-11T00:02:00+00:00')
        self.assertEqual(result['source']['sha256'], hashlib.sha256(b'selected source').hexdigest())
        self.assertEqual(result['tool_activity']['occupied_bins'], [0])
        self.assertEqual(result['tool_activity']['origin_utc'], '2026-10-11T00:01:00Z')
        component = result['cost']['components'][0]
        self.assertEqual(component['input_tokens'], 57204)  # cache reads and writes included once
        self.assertEqual(component['cache_write_1h_tokens'], 30063)

    def test_codex_counter_snapshot_is_not_counted_twice(self):
        rows = [
            {'type': 'turn_context', 'timestamp': '2026-10-11T00:00:00Z',
             'payload': {'model': 'gpt-6-sol'}},
            {'type': 'event_msg', 'timestamp': '2026-10-11T00:00:10Z',
             'payload': {'type': 'token_count', 'info': {
                 'total_token_usage': {'input_tokens': 100, 'output_tokens': 5},
                 'last_token_usage': {'input_tokens': 100, 'output_tokens': 5,
                                      'cached_input_tokens': 40}}}},
            {'type': 'event_msg', 'timestamp': '2026-10-11T00:00:12Z',
             'payload': {'type': 'token_count', 'info': {
                 'total_token_usage': {'input_tokens': 100, 'output_tokens': 5},
                 'last_token_usage': {'input_tokens': 100, 'output_tokens': 5,
                                      'cached_input_tokens': 40}}}},
            {'type': 'response_item', 'timestamp': '2026-10-11T00:01:00Z',
             'payload': {'type': 'function_call', 'call_id': 'tool-1'}},
        ]
        meta = {'models': ['gpt-6-sol'], 'input_tokens': 100,
                'output_tokens': 5, 'cached_input_tokens': 40}
        result = estimate_inputs(rows, 'codex', b'codex source', meta)
        self.assertEqual(result['cost']['components'][0]['input_tokens'], 100)
        self.assertEqual(result['tool_activity']['occupied_bins'], [1])

    def test_missing_model_or_timestamps_do_not_create_numbers(self):
        rows = [{'type': 'event_msg', 'timestamp': '2026-10-11T00:00:00Z',
                 'payload': {'type': 'token_count', 'info': {
                     'total_token_usage': {'input_tokens': 9, 'output_tokens': 1},
                     'last_token_usage': {'input_tokens': 9, 'output_tokens': 1}}}}]
        result = estimate_inputs(rows, 'codex', b'x',
                                 {'models': [], 'input_tokens': 9, 'output_tokens': 1})
        self.assertIsNone(result)
        self.assertIsNone(estimate_inputs(rows, 'cursor', b'x', {}))


if __name__ == '__main__':
    unittest.main()
