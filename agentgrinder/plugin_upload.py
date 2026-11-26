"""Save an approved review through an explicitly supplied STRIVE Connect token.

This is a standalone integration, outside the distributed editor plugin.
"""
import base64
import gzip
import json
import re
import urllib.request
import uuid

from .plugin import FIELDS, digest, encoded, origin


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None


def save(db, review_id, approved, base, token=None):
    if approved != review_id: raise ValueError('Approve the exact reviewed payload with --approve <review ID>.')
    base = origin(base)
    if not re.fullmatch(r'ag_[a-f0-9-]{72}', token or ''):
        raise ValueError('Provide an explicit STRIVE Connect token.')
    row = db.execute('select payload from reviews where id=?',(review_id,)).fetchone()
    if row is None: raise ValueError('Review not found.')
    bundle = json.loads(row[0])
    if digest(bundle) != review_id: raise ValueError('Review integrity check failed; make a new review.')
    account = digest(token.encode())
    results = []
    for payload in bundle['runs']:
        if payload.get('visibility') != 'private' or set(payload)-FIELDS-{'title','visibility'}:
            raise ValueError('Only the reviewed private metrics payload may be sent.')
        revision = payload['measurement_revision']
        args = (review_id, revision, base, account)
        request_id = str(uuid.uuid5(uuid.NAMESPACE_URL, encoded([base,account,revision])))
        with db: db.execute('insert or ignore into saves values(?,?,?,?,?,null)',args+(request_id,))
        prior = db.execute('select request,result from saves where review=? and revision=? and origin=? and account=?',args).fetchone()
        if prior['result']:
            results.append(json.loads(prior['result'])); continue
        req = urllib.request.Request(base+'/api/agent/runs',data=encoded(payload).encode(),method='POST',
            headers={'Content-Type':'application/json','Authorization':'Bearer '+token,'Idempotency-Key':prior['request']})
        try:
            with urllib.request.build_opener(NoRedirect).open(req,timeout=20) as response:
                result = json.load(response)
            run_id = str(uuid.UUID(str(result.get('id'))))
            if not isinstance(result.get('existing'),bool) or result.get('visibility') not in ('private','public','link','close_friends','crew','anonymous'):
                raise ValueError()
        except (OSError, ValueError, AttributeError):
            results.append({'status':'unknown; retry this same review','project':payload['project']})
            break
        result = {'id':run_id,'existing':result['existing'],'visibility':result['visibility'],'project':payload['project'],'url':base+'/r/'+run_id}
        if result['visibility']=='private':
            preview={**payload,'visibility':'private','review_run_id':run_id}
            packed=base64.urlsafe_b64encode(gzip.compress(encoded(preview).encode(),mtime=0)).decode().rstrip('=')
            result.update(review_required=True,preview_url=base+'/#import=gz.'+packed)
        else:result['review_required']=False
        with db: db.execute('update saves set result=? where review=? and revision=? and origin=? and account=?',(encoded(result),)+args)
        results.append(result)
    return {'review':review_id,'results':results,'sharing':'No sharing action performed; stored audience is reported for each result.'}
