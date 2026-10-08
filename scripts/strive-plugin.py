#!/usr/bin/env python3
"""Build or install STRIVE native plugins without replacing user configuration."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[1]
MARKER = '.strive-bundle.json'


def build(target, vendor=None):
    target = Path(target).expanduser().resolve()
    if target.exists(): raise ValueError('Destination exists; choose a new bundle directory.')
    portable = (REPO/'runtime/agentgrinder').is_dir()
    if portable and REPO in target.parents:
        raise ValueError('Build the new bundle outside this bundle directory.')
    target.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent,prefix='.strive-build-') as tmp:
        staged=Path(tmp)/'strive'
        if portable:
            shutil.copytree(REPO,staged,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        else:
            shutil.copytree(REPO/'plugins/strive',staged,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
            shutil.copytree(REPO/'agentgrinder',staged/'runtime/agentgrinder',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
            shutil.copy2(REPO/'LICENSE',staged/'LICENSE')
            shutil.copy2(__file__,staged/'scripts/strive-plugin.py')
        if vendor=='claude':
            # Cursor automatically imports Claude packages. Its own manifest takes
            # precedence there, while Claude still reads .claude-plugin/plugin.json.
            # Explicit empty directories replace Cursor discovery; [] can fall back.
            empty=staged/'cursor-disabled';empty.mkdir()
            manifest=staged/'.cursor-plugin/plugin.json'
            value=json.loads(manifest.read_text())
            value.update(displayName='STRIVE for Claude Code (inactive in Cursor)',
                         description='Claude Code integration only. Use the native STRIVE local plugin in Cursor.',
                         skills='./cursor-disabled',commands='./cursor-disabled',
                         agents='./cursor-disabled',rules='./cursor-disabled',
                         hooks={'version':1,'hooks':{}})
            manifest.write_text(json.dumps(value,indent=2)+'\n')
        (staged/MARKER).write_text(json.dumps({'owner':'strive-plugin-installer','version':1,'vendor':vendor})+'\n')
        staged.rename(target)
    return target


def run_claude(config, *args):
    env=dict(os.environ)
    if Path(config).expanduser().resolve()==(Path.home()/'.claude').resolve():
        # Claude's default auth file is ~/.claude.json. Setting CLAUDE_CONFIG_DIR
        # even to ~/.claude changes that lookup to ~/.claude/.claude.json.
        env.pop('CLAUDE_CONFIG_DIR',None)
    else:
        env['CLAUDE_CONFIG_DIR']=str(config)
    subprocess.run(['claude','plugin',*args],env=env,check=True)


def install(vendor,config):
    config=Path(config).expanduser().resolve()
    if vendor=='cursor':
        target=build(config/'plugins/local/strive',vendor='cursor')
        return {'installed_files':str(target),'client_loaded':False,'next':'Reload Cursor, then open Customize → Plugins → STRIVE. Local imports must be allowed.'}
    # Claude owns its settings through its CLI. No manual rewrite of settings.json.
    market=config/'strive-marketplace'
    if market.exists(): raise ValueError('STRIVE marketplace exists. Uninstall before replacing it.')
    target=build(market/'strive',vendor='claude')
    (market/'.claude-plugin').mkdir()
    (market/'.claude-plugin/marketplace.json').write_text(json.dumps({'name':'strive-local','owner':{'name':'STRIVE'},'plugins':[{'name':'strive','source':'./strive','description':'Selected real session cards'}]},indent=2)+'\n')
    run_claude(config,'marketplace','add',str(market))
    run_claude(config,'install','strive@strive-local','--scope','user')
    return {'installed_files':str(target),'registered_by_client':True,'client_loaded':False,'next':'Restart Claude Code and run /strive:strive.'}


def uninstall(vendor,config):
    config=Path(config).expanduser().resolve()
    target=config/('plugins/local/strive' if vendor=='cursor' else 'strive-marketplace/strive')
    if not target.exists(): return {'removed':False,'reason':'STRIVE package not found','capture_data_preserved':True}
    marker=target/MARKER
    if target.is_symlink() or not marker.is_file() or json.loads(marker.read_text()).get('owner')!='strive-plugin-installer':
        raise ValueError('Not an installer-owned STRIVE package; refusing to remove it.')
    if vendor=='claude':
        run_claude(config,'uninstall','strive@strive-local','--scope','user')
        run_claude(config,'marketplace','remove','strive-local')
    shutil.rmtree(target)
    if vendor=='claude':
        manifest=target.parent/'.claude-plugin/marketplace.json'
        manifest.unlink(missing_ok=True)
        for folder in (manifest.parent,target.parent):
            try: folder.rmdir()
            except OSError: pass
    return {'removed':True,'capture_data_preserved':True,'other_plugins_preserved':True}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    q=sub.add_parser('build');q.add_argument('destination')
    for name in ('install','uninstall'):
        q=sub.add_parser(name);q.add_argument('vendor',choices=['cursor','claude']);q.add_argument('--config-dir')
    a=p.parse_args()
    try:
        if a.command=='build': result={'bundle':str(build(a.destination))}
        else:
            config=a.config_dir or str(Path.home()/('.'+a.vendor))
            result=(install if a.command=='install' else uninstall)(a.vendor,config)
        print(json.dumps(result,indent=2));return 0
    except (OSError,ValueError,subprocess.CalledProcessError) as e:
        print(json.dumps({'error':str(e)}));return 1


if __name__=='__main__':raise SystemExit(main())
