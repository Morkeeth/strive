"""Bounded model names and recorded usage only; no text or request identifiers exported."""
import re

KEYS = {'models', 'basis', 'input_tokens', 'output_tokens', 'cached_input_tokens', 'reasoning_tokens'}
TOKEN_KEYS = KEYS - {'models', 'basis'}
def count(v):
    return type(v) is int and 0 <= v <= 9007199254740991

def validate(value):
    if value is None:
        return None
    if not isinstance(value, dict) or set(value)-KEYS or value.get('basis') not in ('codex-records', 'claude-message-usage', 'cursor-model-info'):
        raise ValueError('Unsupported capture metadata')
    models = value.get('models')
    if not isinstance(models, list) or len(models)>32 or any(not isinstance(m,str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9 ._:/+\-]{0,119}',m) for m in models):
        raise ValueError('Invalid recorded model')
    for key in TOKEN_KEYS:
        if value.get(key) is not None and not count(value[key]):
            raise ValueError('Invalid recorded token count')
    for subset,total in [('cached_input_tokens','input_tokens'),('reasoning_tokens','output_tokens')]:
        if value.get(subset) is not None and (not count(value.get(total)) or value[subset]>value[total]):
            raise ValueError('Token subset exceeds total')
    if count(value.get('input_tokens')) and count(value.get('output_tokens')) and not count(value['input_tokens']+value['output_tokens']):
        raise ValueError('Token count too large')
    return value

def recorded(records, harness):
    models=set(); usages={}
    def model(v):
        if isinstance(v,str) and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9 ._:/+\-]{0,119}',v): models.add(v)
    for row in records:
        p=row.get('payload') or {}; msg=row.get('message') or {}
        if not isinstance(p,dict): p={}
        if not isinstance(msg,dict): msg={}
        if harness=='codex':
            if row.get('type')=='turn_context': model(p.get('model'))
            if row.get('type')!='event_msg' or p.get('type')!='token_count': continue
            info=p.get('info') or {}; usage=info.get('last_token_usage') or {}; total=info.get('total_token_usage') or {}
            # Repeated snapshots have identical cumulative counters. Only last-call deltas are summed,
            # so selecting a later sitting never imports the earlier cumulative total.
            if not all(count(total.get(k)) and count(usage.get(k)) for k in ('input_tokens','output_tokens')): continue
            key=(total['input_tokens'],total['output_tokens'])
            usages[key]={k:usage.get(k) for k in TOKEN_KEYS if count(usage.get(k))}
        elif harness=='claude':
            if row.get('type')!='assistant' or row.get('isSidechain'): continue
            model(msg.get('model')); usage=msg.get('usage') or {}; key=msg.get('id')
            if not key or not all(count(usage.get(k)) for k in ('input_tokens','output_tokens')): continue
            cache=usage.get('cache_read_input_tokens',0); creation=usage.get('cache_creation_input_tokens',0)
            if not count(cache) or not count(creation): continue
            current={'input_tokens':usage['input_tokens']+cache+creation,'output_tokens':usage['output_tokens'],'cached_input_tokens':cache}
            prior=usages.get(key,{})
            usages[key]={k:max(v,prior.get(k,0)) for k,v in current.items()}
        else:
            # Cursor's selected model is not proof of the model used. Only observed message info.
            info=msg.get('modelInfo') or row.get('modelInfo') or {}
            if isinstance(info,dict): model(info.get('modelName'))
    out={'models':sorted(models)[:32], 'basis':{'codex':'codex-records','claude':'claude-message-usage'}.get(harness,'cursor-model-info')}
    if usages:
        for key in TOKEN_KEYS:
            if all(key in u for u in usages.values()): out[key]=sum(u[key] for u in usages.values())
    return validate(out)
