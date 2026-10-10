import hashlib
import json
from pathlib import Path
import unittest

from agentgrinder.estimate_capture import PRICES, estimate_inputs


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

    def test_frozen_showcase_rates_match_plugin_rates(self):
        fixture = json.loads((Path(__file__).parent/'fixtures/showcase-estimate-rates.json').read_text())
        for model, rates in fixture['rates'].items():
            self.assertEqual(PRICES[model]['rates_per_million'], rates, model)

    def test_sidechain_usage_is_excluded_from_both_population_and_cost(self):
        main = {'type': 'assistant', 'timestamp': '2026-10-11T00:01:09Z',
                'message': {'id': 'main', 'model': 'claude-opus-5-5',
                            'usage': {'input_tokens': 10, 'output_tokens': 3,
                                      'cache_read_input_tokens': 0, 'cache_creation_input_tokens': 0},
                            'content': []}}
        side = {'type': 'assistant', 'isSidechain': True, 'timestamp': '2026-10-11T00:01:10Z',
                'message': {'id': 'child', 'model': 'claude-fable-5-1',
                            'usage': {'input_tokens': 100000, 'output_tokens': 50000,
                                      'cache_read_input_tokens': 0, 'cache_creation_input_tokens': 0},
                            'content': []}}
        metadata = {'models': ['claude-opus-5-5'], 'input_tokens': 10, 'output_tokens': 3,
                    'cached_input_tokens': 0}
        result = estimate_inputs([main, side], 'claude', b'parent', metadata)
        self.assertEqual(len(result['cost']['components']), 1)
        self.assertEqual(result['cost']['components'][0]['input_tokens'], 10)

    def test_mixed_known_and_unknown_model_keeps_dollars_unknown(self):
        rows = []
        for index, model in enumerate(('claude-opus-5-5', 'unknown-model')):
            rows.append({'type': 'assistant', 'timestamp': f'2026-10-11T00:01:0{index}Z',
                         'message': {'id': str(index), 'model': model,
                                     'usage': {'input_tokens': 10, 'output_tokens': 2,
                                               'cache_read_input_tokens': 0,
                                               'cache_creation_input_tokens': 0}, 'content': []}})
        metadata = {'models': ['claude-opus-5-5', 'unknown-model'],
                    'input_tokens': 20, 'output_tokens': 4, 'cached_input_tokens': 0}
        result = estimate_inputs(rows, 'claude', b'mixed', metadata)
        self.assertEqual(len(result['cost']['components']), 2)
        self.assertIsNone(next(c['price'] for c in result['cost']['components']
                               if c['model'] == 'unknown-model'))

    def test_haiku_prompt_length_selects_the_right_price_tier(self):
        from agentgrinder.estimate_capture import _price
        self.assertEqual(_price('claude-haiku-5-5', 100000)['rates_per_million']['input'], .1)
        self.assertEqual(_price('claude-haiku-5-5', 100001)['rates_per_million']['input'], .5)


if __name__ == '__main__':
    unittest.main()
