"""Explicit, scoped agent actions. Credentials are read once and never returned to a model."""
from __future__ import annotations
import json
import os
import uuid
import urllib.error
import urllib.parse
import urllib.request

from .a2a_client import DEFAULT_URL, DEFAULT_KEY, DEFAULT_SCHEMA
from .contract import validate_run
from .push import export_run

RUN_FIELDS = {"title","project","harness","turns_typed","duration_s","tool_calls","shell_calls","files_touched",
              "commits","claims","claims_verified","artifacts_produced","started","visibility",
              "rhythm","route","schema_version","measurement_revision","baseline_revision","note","trace_basis",
              # STRIVE run shape, accepted by the database since migration 006.
              "ridge","worker_bins","commit_bins","ridge_basis","ridge_wall_seconds","ridge_tool_calls","wall_time_s","model",
              # Declared outcome receipts, accepted since migration 008. Links and short lines the
              # uploader states. They are never measurements.
              "repo_url","receipts","shipped","artifact_url","image_url",
              # Code Route journey (migration 009). Ordered project lanes and checkpoints.
              "code_route"}


def run_payload(run: dict, visibility: str = "private", *, title: str | None = None, note: str | None = None) -> dict:
    validate_run(run)
    if visibility not in ("private","public"):
        raise ValueError("Agent publishing supports private or explicitly authorised public grinds.")
    exported=export_run(run)
    payload={k:v for k,v in exported.items() if k in RUN_FIELDS}
    # A parser title can be the first typed prompt. Only separately chosen public text travels.
    for field,value,limit in (("title",title,200),("note",note,4000)):
        if value is not None:
            if not isinstance(value,str) or len(value)>limit:raise ValueError("Public text is invalid or too long.")
            payload[field]=value
    payload["visibility"]=visibility
    return payload


class AgentClient:
    def __init__(self,token: str | None = None,base_url: str = DEFAULT_URL,api_key: str = DEFAULT_KEY):
        self._token=token if token is not None else os.environ.get("AGENTGRINDER_AGENT_TOKEN")
        if not self._token:raise ValueError("Set AGENTGRINDER_AGENT_TOKEN to a credential granted by the agent's owner.")
        parsed=urllib.parse.urlsplit(base_url)
        local=parsed.hostname in ("localhost","127.0.0.1","::1")
        if (parsed.scheme!="https" and not (local and parsed.scheme=="http")) or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Agent credentials require HTTPS (HTTP is allowed only on localhost).")
        self._url=base_url.rstrip('/')+'/rest/v1/rpc/grinder_agent_action'
        self._key=api_key
        # A product origin (https://striverun.app) has no /rest/v1 path; it takes a
        # publish at POST /api/agent/runs (docs/AGENT-UPLOAD-API.md section 2). A Supabase host,
        # or any localhost URL (the local stack), keeps the direct RPC.
        host=parsed.hostname or ''
        self._product=None
        if not local and not host.endswith('.supabase.co'):
            self._product=base_url.rstrip('/')+'/api/agent/runs'

    def questions(self) -> list:
        if self._product:raise ValueError('Questions need the Supabase URL, not the app URL.')
        request=urllib.request.Request(self._url.replace('grinder_agent_action','grinder_agent_questions'),
            data=json.dumps({'token':self._token}).encode(),method='POST',
            headers={'Content-Type':'application/json','apikey':self._key,'Content-Profile':DEFAULT_SCHEMA})
        try:
            with urllib.request.urlopen(request,timeout=30) as response: result=json.load(response)
        except (urllib.error.URLError,ValueError):
            raise RuntimeError('Agent questions unavailable. Check public reply scope and expiry.') from None
        if not isinstance(result,list): raise RuntimeError('Agent endpoint returned an invalid question list.')
        return result

    def perform(self,action: str,payload: dict,request_id: str | None = None) -> dict:
        if action not in ("draft","publish","reply","ack"):raise ValueError("Unsupported agent action.")
        rid=str(uuid.UUID(request_id)) if request_id else str(uuid.uuid4())
        if self._product:
            if action!='publish':raise ValueError('A product URL takes publish only. Pass the Supabase URL for draft, reply or ack.')
            return self._publish_via_product(payload,rid)
        raw=json.dumps(dict(token=self._token,action=action,payload=payload,request_id=rid)).encode()
        request=urllib.request.Request(self._url,data=raw,method='POST',headers={
            'Content-Type':'application/json','apikey':self._key,'Content-Profile':DEFAULT_SCHEMA})
        try:
            with urllib.request.urlopen(request,timeout=30) as response:
                result=json.load(response)
        except urllib.error.HTTPError as error:
            # Do not echo a response body that may contain supplied credentials or private text.
            hint=' No agent endpoint at this URL: pass --url https://striverun.app or the Supabase URL.' if error.code==404 else ' Check the granted scope and expiry.'
            raise RuntimeError(f"Agent action rejected (HTTP {error.code}); request {rid}.{hint}") from None
        except urllib.error.URLError:
            raise RuntimeError(f"Agent endpoint unavailable; reuse request {rid} with the same payload when retrying.") from None
        if not isinstance(result,dict) or 'id' not in result:
            raise RuntimeError(f"Agent endpoint returned an invalid response; request {rid}.")
        try:
            result_id=str(uuid.UUID(result['id']))
            actor_id=str(uuid.UUID(result['agent_id'])) if result.get('agent_id') else None
        except (ValueError,TypeError,KeyError):
            raise RuntimeError(f'Agent endpoint returned an invalid identity; request {rid}.') from None
        if result.get('action')!=action:raise RuntimeError(f'Agent endpoint returned a mismatched action; request {rid}.')
        safe=dict(id=result_id,action=action,request_id=rid)
        if actor_id:safe['agent_id']=actor_id
        if action=='publish':
            # Report the audience the server stored. A retry of a saved measurement returns the
            # existing run, and its audience is never widened by the retry.
            if not isinstance(result.get('existing'),bool) or result.get('visibility') not in ('private','close_friends','link','public','crew','anonymous'):
                raise RuntimeError(f'Agent endpoint returned no stored audience; request {rid}.')
            safe['existing']=result['existing'];safe['visibility']=result['visibility']
        return safe


    def _publish_via_product(self,payload: dict,rid: str) -> dict:
        class _NoRedirect(urllib.request.HTTPRedirectHandler):
            # A redirect would resend the bearer token to wherever it points. Never follow one.
            def redirect_request(self,*args,**kwargs):return None
        request=urllib.request.Request(self._product,data=json.dumps(payload).encode(),method='POST',headers={
            'Content-Type':'application/json','Authorization':'Bearer '+self._token,'Idempotency-Key':rid})
        try:
            with urllib.request.build_opener(_NoRedirect).open(request,timeout=30) as response:result=json.load(response)
        except urllib.error.HTTPError as error:
            try:detail=json.load(error).get('error')
            except (ValueError,AttributeError):detail=None
            # The server's messages are its own raise texts and never echo the token.
            raise RuntimeError(f"Upload refused (HTTP {error.code}): {detail or 'no reason given'}; request {rid}.") from None
        except urllib.error.URLError:
            raise RuntimeError(f"STRIVE unavailable; rerun with --request-id {rid} and the same payload.") from None
        if not isinstance(result,dict) or not isinstance(result.get('existing'),bool) or result.get('visibility') not in ('private','close_friends','link','public','crew','anonymous'):
            raise RuntimeError(f'STRIVE returned no stored run; request {rid}.')
        try:run_id=str(uuid.UUID(str(result.get('id'))))
        except ValueError:raise RuntimeError(f'STRIVE returned an invalid run id; request {rid}.') from None
        return dict(id=run_id,action='publish',request_id=rid,existing=result['existing'],visibility=result['visibility'])


def add_parser(subparsers):
    parser=subparsers.add_parser('agent',help='use a human-granted agent credential for explicit network actions')
    parser.add_argument('--url',default=DEFAULT_URL,
        help='where to send: https://striverun.app for the hosted app (publish only), '
             'or a Supabase URL (default: AGENTGRINDER_SUPABASE_URL or the local stack)')
    parser.add_argument('--request-id',help='reuse the same ID and payload after an uncertain network response')
    actions=parser.add_subparsers(dest='agent_action',required=True)
    capture=actions.add_parser('capture',help='capture an explicit Claude SDK/sidechain transcript locally; no network')
    capture.add_argument('transcript')
    for name in ('draft','publish'):
        action=actions.add_parser(name);action.add_argument('run_json')
        action.add_argument('--visibility',choices=['private','public'],default='private')
        action.add_argument('--title',help='explicit public title; parser-derived titles are not uploaded')
        action.add_argument('--note',help='explicit caption to share')
    actions.add_parser('questions',help='read bounded public questions and their permitted evidence')
    reply=actions.add_parser('reply');reply.add_argument('run_id');reply.add_argument('body');reply.add_argument('--question-id')
    ack=actions.add_parser('ack');ack.add_argument('run_id');ack.add_argument('--reason',required=True,choices=['shipped','focus','pace','rig','comeback','handoff'])


def run_cli(args):
    from pathlib import Path
    try:
        if args.agent_action=='capture':
            from .automated_capture import capture
            print(json.dumps(capture(args.transcript),indent=2));return 0
        if args.agent_action=='questions':
            print(json.dumps(AgentClient(base_url=args.url).questions(),indent=2));return 0
        if args.agent_action in ('draft','publish'):
            payload=run_payload(json.loads(Path(args.run_json).read_text()),args.visibility,title=args.title,note=args.note)
        elif args.agent_action=='reply':
            payload=dict(run_id=str(uuid.UUID(args.run_id)),body=args.body)
            if args.question_id:payload['question_id']=str(uuid.UUID(args.question_id))
        else:payload=dict(run_id=str(uuid.UUID(args.run_id)),reason=args.reason)
        result=AgentClient(base_url=args.url).perform(args.agent_action,payload,args.request_id)
        print(json.dumps(result,indent=2));return 0
    except (ValueError,RuntimeError,OSError) as error:
        print(str(error));return 1
