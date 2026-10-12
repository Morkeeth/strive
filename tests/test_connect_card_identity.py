"""Connect wrapper agent_name must not eclipse harness session identity on the card."""
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "site" / "index.html").read_text()
PROGRESS = (ROOT / "site" / "progress.js").read_text()
SHARING = (ROOT / "site" / "sharing.js").read_text()


def test_helpers_distinguish_connect_wrapper():
    assert "function connectWrapperName" in INDEX
    assert "function runUploadIdentity" in INDEX
    assert "uploaded via Connect" in INDEX
    assert "Session:" in INDEX
    assert "via Connect" in PROGRESS
    assert "via Connect" in SHARING
    assert "/^connect$/i" in INDEX and "/^connect$/i" in SHARING


def test_rendered_card_leads_with_harness_not_connect_name():
    script = r"""
const fs=require('fs'),vm=require('vm');
const root=process.argv[1];
const {ctx:context}=require(root+'/tests/site-card-context.cjs')(root);
const base={id:'r1',profile_id:'p1',created_at:'2026-09-19T00:00:00Z',title:'Private Connect upload',
 started_at:'2026-09-19T00:00:00Z',duration_s:60,prompts:1,tool_calls:3,harness:'Grok Bot',
 agent_name:'Connect',source_actor_id:'11111111-1111-1111-1111-111111111111'};
const htmlOut=vm.runInContext('runCard('+JSON.stringify(base)+',false,0)',context);
if(!htmlOut.includes('uploaded via Connect')) throw new Error('missing Connect upload path');
if(!htmlOut.includes('Grok Bot')) throw new Error('missing harness');
if(/Agent contribution:\s*<a[^>]*>Connect</.test(htmlOut)) throw new Error('Connect still shown as agent contribution name');
if(!htmlOut.includes('Session:')) throw new Error('missing Session label');
process.stdout.write(JSON.stringify({ok:true}));
"""
    out = subprocess.check_output(["node", "-e", script, str(ROOT)], text=True)
    assert '"ok":true' in out.replace(" ", "")
