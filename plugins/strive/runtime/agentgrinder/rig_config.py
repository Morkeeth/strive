"""Import a declared Grinder Rig with a preview and reversible local version history.
No provider configuration, command, MCP process or downloaded instruction is executed.
"""
from pathlib import Path
import hashlib
import json
import os
import re
from datetime import datetime, timezone


def validate(document):
    if not isinstance(document,dict) or document.get('schema_version')!=1:raise ValueError('Expected a version 1 Rig manifest.')
    m=document.get('manifest')
    if not isinstance(m,dict) or set(m)-{'harnesses','model','mcps','skills','notes'}:raise ValueError('Unsupported Rig fields.')
    for key,value in m.items():
        if key in ('harnesses','mcps','skills'):
            if not isinstance(value,list) or any(not isinstance(v,str) or not 1<=len(v)<=100 for v in value):raise ValueError('Rig names must be short text lists.')
        elif not isinstance(value,str) or len(value)>2000:raise ValueError('Rig fields must be short text.')
    text=json.dumps(m,sort_keys=True)
    if len(text.encode())>16384 or re.search(r'sk-[a-z0-9]{16,}|/Users/|/home/|-----BEGIN .*PRIVATE KEY|bearer [a-z0-9._-]{16,}',text,re.I):raise ValueError('Remove credentials and local paths from the Rig.')
    return document


def root_path(root=None):
    root=Path(root or Path.home()/'.agentgrinder'/'rigs')
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    return root


def current(root=None):
    path=root_path(root)/'current.json'
    return json.loads(path.read_text()) if path.exists() else None


def preview(document,root=None):
    validate(document)
    before=(current(root) or {}).get('document',{}).get('manifest',{})
    after=document['manifest']
    return [{'field':key,'before':before.get(key),'after':after.get(key)} for key in sorted(set(before)|set(after)) if before.get(key)!=after.get(key)]


def select(document,root=None):
    validate(document);root=root_path(root)
    raw=json.dumps(document,sort_keys=True,separators=(',',':'))
    revision=hashlib.sha256(raw.encode()).hexdigest()
    version=root/(revision+'.json')
    if not version.exists():
        with version.open('x') as f: f.write(raw)
        version.chmod(0o600)
    selection={'revision':revision,'selected_at':datetime.now(timezone.utc).isoformat(),'document':document}
    temporary=root/('selection-'+os.urandom(8).hex()+'.json')
    temporary.touch(mode=0o600)
    temporary.write_text(json.dumps(selection,indent=2));temporary.replace(root/'current.json')
    return selection


def add_parser(sub):
    p=sub.add_parser('rig-config',help='preview, import or revert your declared Grinder Rig; provider settings stay unchanged')
    p.add_argument('--directory')
    actions=p.add_subparsers(dest='rig_action',required=True)
    for name in ('preview','import'): actions.add_parser(name).add_argument('manifest')
    actions.add_parser('current')
    actions.add_parser('revert').add_argument('revision')


def run_cli(args):
    try:
        if args.rig_action=='current':result=current(args.directory)
        elif args.rig_action=='revert':
            if not re.fullmatch('[a-f0-9]{64}',args.revision):raise ValueError('Choose a saved local Rig revision.')
            document=json.loads((root_path(args.directory)/(args.revision+'.json')).read_text())
            result=select(document,args.directory)
        else:
            document=json.loads(Path(args.manifest).read_text())
            changes=preview(document,args.directory)
            result={'changes':changes,'effect':'Declared Grinder Rig only; agent settings are unchanged.'}
            if args.rig_action=='import':result['selected']=select(document,args.directory)
        print(json.dumps(result,indent=2));return 0
    except (OSError,ValueError) as error:
        print(str(error));return 1
