"""Native Codex authorship and timestamped activity, without transcript text in exports."""
import json
from collections import Counter
from datetime import datetime

# Records with the user role that no person typed. The last one is the desktop app's attachment
# record; its own prompt, when there was one, is a separate record.
CODEX_INJECTED = ('<recommended_plugins>', '<environment_context>', '<turn_aborted>', '# Files mentioned by the user:')


def codex_activity(path, records=None):
    if records is None:
        from .native_sittings import records as read_records
        records = list(read_records(path))
    delegated = any(isinstance((r.get('payload') or {}).get('source'), dict) and 'subagent' in r['payload']['source']
                    for r in records if r.get('type') == 'session_meta')
    counts = Counter(human=0, injected=0, delegated=0)
    events, calls = [], set()
    # TWO SHAPES OF A TYPED TURN. The CLI writes `event_msg` / `user_message`. The Codex desktop
    # app (rollouts of 29 Jul 2026 on the author's machine) writes none of those: the person's
    # words are `response_item` / `message` / role `user`, beside injected user-role records
    # (plugin lists, "Files mentioned by the user" attachments). A file that carries the event
    # form is read by it alone; otherwise the message form counts, so a session the person did
    # type in is not a session of zero prompts. site/dropin-parse.js codexReader is the same rule.
    has_events = any(row.get('type') == 'event_msg' and isinstance(row.get('payload'), dict)
                     and row['payload'].get('type') == 'user_message' for row in records)
    for index, row in enumerate(records):
        p = row.get('payload')
        if not isinstance(p, dict): continue
        kind = None
        text = None
        if row.get('type') == 'event_msg' and p.get('type') == 'user_message':
            text = p.get('message') or ''
        elif (not has_events and row.get('type') == 'response_item' and p.get('type') == 'message'
              and p.get('role') == 'user'):
            content = p.get('content')
            text = ''.join(c.get('text') or '' for c in content if isinstance(c, dict)) if isinstance(content, list) else str(content or '')
        if text is not None:
            if delegated:
                counts['delegated'] += 1
            elif text.lstrip().startswith(CODEX_INJECTED):
                counts['injected'] += 1
            else:
                counts['human'] += 1
                kind = 'human'
        elif p.get('type') in ('function_call', 'custom_tool_call'):
            identity = p.get('call_id') or p.get('id') or ('record', index)
            if identity not in calls:
                calls.add(identity)
                kind = 'tool'
        elif p.get('type') == 'patch_apply_end' and p.get('success') is True:
            kind = 'edit'
        if kind:
            try:
                stamp = datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00'))
                if stamp.tzinfo is not None: events.append((stamp.timestamp(), kind))
            except (KeyError, TypeError, ValueError):
                pass
    events.sort()
    start = events[0][0] if events else 0
    span = max(1, events[-1][0] - start) if events else 1
    buckets = [0] * min(24, max(1, counts['human']))
    for stamp, kind in events:
        if kind == 'human': buckets[min(len(buckets)-1, int((stamp-start)/span*len(buckets)))] += 1
    trace = [{'second': round(stamp-start, 3), 'kind': kind} for stamp, kind in events]
    return dict(typed=counts['human'], tools=len(calls), authorship=dict(counts), trace=trace, rhythm=buckets,
                trace_basis='timestamped native events' if events else 'timestamps unavailable')


def svg(trace, basis):
    """Shared native trace. Labels never contain paths, prompts or tool arguments."""
    from html import escape
    width, height = 720, 134
    maximum = max((e['second'] for e in trace), default=1) or 1
    rows = {'human': (26, 'You'), 'tool': (64, 'Agent tools'), 'edit': (102, 'Patch succeeded')}
    lines = []
    for key, (y, label) in rows.items():
        lines.append(f'<text x="10" y="{y-8}" fill="currentColor" font-size="12">{label}</text><path d="M120 {y}H705" stroke="currentColor" opacity=".15"/>')
        for event in trace:
            if event['kind'] == key:
                x = 120 + event['second']/maximum*580
                lines.append(f'<path d="M{x:.1f} {y-5}v10" stroke="var(--accent)" stroke-width="2"/>')
    return f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{escape(basis)}">'+''.join(lines)+'</svg><small>'+escape(basis)+'</small>'
