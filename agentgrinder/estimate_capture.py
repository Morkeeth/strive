"""Source-bound estimate inputs for the native STRIVE plugin.

These are API-price comparisons and occupied tool-call minutes, not a bill or
continuous work time. Unknown prices or incomplete usage never become zeroes.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib


# Rates checked against the providers' model pages on 2026-10-11. Keep this
# deliberately small: an unlisted model receives no dollar estimate.
PRICES = {
    'gpt-6-sol': {
        'table_url': 'https://developers.openai.com/api/docs/models/gpt-6-sol',
        'rates_per_million': {'input': 2, 'output': 10, 'cache_read': .2,
                              'cache_write_5m': None, 'cache_write_1h': None},
        'context_tier': 'input <=272K', 'service_tier': 'standard-assumed',
    },
    'claude-opus-5-5': {
        'table_url': 'https://platform.claude.com/docs/en/models/opus-5-5/overview',
        'rates_per_million': {'input': 4, 'output': 20, 'cache_read': .2,
                              'cache_write_5m': 5, 'cache_write_1h': 8},
        'context_tier': 'standard global', 'service_tier': 'standard',
    },
}


def _stamp(row):
    value = row.get('timestamp')
    if not isinstance(value, str): return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except ValueError:
        return None


def _iso(value):
    precision = 'microseconds' if value.microsecond else 'seconds'
    return value.isoformat(timespec=precision).replace('+00:00', 'Z')


def _count(value):
    return type(value) is int and 0 <= value <= 9007199254740991


def _price(model):
    record = PRICES.get(model)
    if not record: return None
    return {**record, 'table_version': 'provider-model-page-2026-10-11',
            'checked_on': '2026-10-11', 'currency': 'USD'}


def _codex_usage(rows):
    model = None
    epoch = 0
    prior_total = None
    calls = {}
    for row in rows:
        payload = row.get('payload') or {}
        if not isinstance(payload, dict): continue
        if row.get('type') == 'turn_context' and isinstance(payload.get('model'), str):
            model = payload['model']
        if row.get('type') != 'event_msg' or payload.get('type') != 'token_count': continue
        info = payload.get('info') or {}
        total = info.get('total_token_usage') or {}
        usage = info.get('last_token_usage') or {}
        if not all(_count(total.get(k)) for k in ('input_tokens', 'output_tokens')): continue
        current = (total['input_tokens'], total['output_tokens'])
        if prior_total is not None and any(a < b for a, b in zip(current, prior_total)):
            epoch += 1
        prior_total = current
        if not model or not all(_count(usage.get(k)) for k in ('input_tokens', 'output_tokens')): continue
        cache = usage.get('cached_input_tokens', 0)
        if not _count(cache) or cache > usage['input_tokens']: continue
        # A long-context call needs its own price tier. The local record has no
        # service tier, so the standard short-context comparison is withheld.
        price = _price(model) if usage['input_tokens'] <= 272000 else None
        calls.setdefault((epoch, *current),
                         (model, usage['input_tokens'], usage['output_tokens'], cache, 0, 0, price))
    return list(calls.values())


def _claude_usage(rows):
    calls = {}
    for row in rows:
        if row.get('type') != 'assistant' or row.get('isSidechain'): continue
        message = row.get('message') or {}
        if not isinstance(message, dict): continue
        model, key, usage = message.get('model'), message.get('id'), message.get('usage')
        if not isinstance(model, str) or not isinstance(key, str) or not isinstance(usage, dict): continue
        if not all(_count(usage.get(k)) for k in ('input_tokens', 'output_tokens')): continue
        read = usage.get('cache_read_input_tokens', 0)
        write = usage.get('cache_creation_input_tokens', 0)
        if not _count(read) or not _count(write): continue
        split = usage.get('cache_creation') or {}
        if not isinstance(split, dict): continue
        w5 = split.get('ephemeral_5m_input_tokens', 0)
        w1 = split.get('ephemeral_1h_input_tokens', 0)
        if not _count(w5) or not _count(w1) or w5 + w1 != write: continue
        total = usage['input_tokens'] + read + write
        if not _count(total): continue
        # Repeated streaming rows for one message ID are cumulative. Keep the
        # largest complete sample, as capture_metadata.recorded does.
        previous = calls.get(key)
        price = _price(model) if total <= 200000 and usage.get('service_tier') in (None, 'standard') else None
        if price and usage.get('service_tier') is None:
            price = {**price, 'service_tier': 'standard-assumed'}
        current = (model, total, usage['output_tokens'], read, w5, w1, price)
        if previous is None or (total, usage['output_tokens']) > (previous[1], previous[2]):
            calls[key] = current
    return list(calls.values())


def _tool_stamps(rows, harness):
    stamps = []
    for row in rows:
        at = _stamp(row)
        if at is None: continue
        if harness == 'codex':
            payload = row.get('payload') or {}
            if row.get('type') == 'response_item' and isinstance(payload, dict) and payload.get('type') in ('function_call', 'custom_tool_call'):
                stamps.append(at)
        elif harness == 'claude' and row.get('type') == 'assistant':
            message = row.get('message') or {}
            if isinstance(message, dict):
                stamps.extend([at for part in message.get('content') or []
                               if isinstance(part, dict) and part.get('type') == 'tool_use'])
    return stamps


def estimate_inputs(rows, harness, source_bytes, metadata, started=None, ended=None):
    """Return a v1 estimate envelope, or None when no timed source exists."""
    if harness not in ('codex', 'claude'): return None
    rows = list(rows)
    stamps = [stamp for row in rows if (stamp := _stamp(row)) is not None]
    if started: stamps.append(datetime.fromisoformat(started.replace('Z', '+00:00')).astimezone(timezone.utc))
    if ended: stamps.append(datetime.fromisoformat(ended.replace('Z', '+00:00')).astimezone(timezone.utc))
    if not stamps: return None
    first, last = min(stamps), max(stamps)
    envelope = {'v': 1, 'source': {'sha256': hashlib.sha256(source_bytes).hexdigest(),
                                  'started_at': _iso(first), 'ended_at': _iso(last)}}
    tool_stamps = _tool_stamps(rows, harness)
    origin = first.replace(second=0, microsecond=0)
    bins = sorted({int((at-origin).total_seconds() // 60) for at in tool_stamps if first <= at <= last})
    if bins and len(bins) <= 2048 and bins[-1] <= int((last-origin).total_seconds() // 60):
        envelope['tool_activity'] = {'method': 'occupied-tool-minutes-v1', 'bin_seconds': 60,
                                     'origin_utc': _iso(origin), 'occupied_bins': bins}
    calls = _codex_usage(rows) if harness == 'codex' else _claude_usage(rows)
    if calls and all(_count(metadata.get(k)) for k in ('input_tokens', 'output_tokens')):
        grouped = {}
        for model, input_tokens, output_tokens, read, w5, w1, price in calls:
            part = grouped.setdefault((model, price is not None), [model, 0, 0, 0, 0, 0, price])
            for index, value in enumerate((input_tokens, output_tokens, read, w5, w1), start=1):
                part[index] += value
        components = []
        for model, input_tokens, output_tokens, read, w5, w1, price in grouped.values():
            components.append({'model': model, 'role': 'primary', 'input_tokens': input_tokens,
                               'output_tokens': output_tokens, 'cache_read_tokens': read,
                               'cache_write_5m_tokens': w5, 'cache_write_1h_tokens': w1,
                               'price': price})
        if (len(components) <= 64 and
                sum(c['input_tokens'] for c in components) == metadata['input_tokens'] and
                sum(c['output_tokens'] for c in components) == metadata['output_tokens'] and
                (metadata.get('cached_input_tokens') is None or
                 sum(c['cache_read_tokens'] for c in components) == metadata['cached_input_tokens']) and
                all(c['model'] in metadata.get('models', []) for c in components)):
            envelope['cost'] = {'method': 'model-price-v1', 'components': components}
    return envelope if 'tool_activity' in envelope or 'cost' in envelope else None
