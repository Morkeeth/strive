"""Connect uses thin 007 agent_token_* wrappers; Agents stays separate."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONNECT = (ROOT / "site" / "connect.js").read_text()
SOCIAL = (ROOT / "site" / "social.js").read_text()
INDEX = (ROOT / "site" / "index.html").read_text()
ACCOUNT = (ROOT / "site" / "account.js").read_text()


def test_connect_calls_thin_wrappers_exactly():
    assert 'rpc("agent_token_create"' in CONNECT
    assert "p_label" in CONNECT
    assert 'rpc("agent_token_list"' in CONNECT
    assert 'rpc("agent_token_revoke"' in CONNECT
    assert "p_id" in CONNECT
    assert "Array.isArray(data)" in CONNECT
    assert "social.agents" not in CONNECT
    assert "grinder_issue_agent_token" not in CONNECT
    assert "Sign in with GitHub" in CONNECT
    assert "signInGitHub" in CONNECT
    assert "/?agents" in CONNECT


def test_connect_primary_next_is_mine_for_private_uploads():
    assert 'href="/?mine">See my runs</a>' in CONNECT
    assert "Private uploads appear in" in CONNECT
    assert "Choose Public when you want a run on the feed." in CONNECT
    # Draw the real page for a signed-in owner with no connections, and for a signed-out visitor.
    script = r"""
const fs=require('fs'),{JSDOM}=require('jsdom');
const w=new JSDOM('<main id="app"></main>',{url:'https://strive.test/?connect',runScripts:'outside-only'}).window;
w.eval(fs.readFileSync('site/connect.js','utf8'));
const calls=[],writes=[];
const rows={eq(){return this},order(){return this},limit:async()=>({data:[],error:null})};
const db={rpc:async(name,args)=>{calls.push(name);return {data:[],error:null}},
 from:table=>({select:()=>rows,update:row=>{writes.push({table,row});return rows},insert:row=>{writes.push({table,row});return rows}})};
const draw=async me=>{w.document.getElementById('app').innerHTML='';
 await w.GrinderConnect({db,me:()=>me,app:()=>w.document.getElementById('app'),frame(){},status(){},signInGitHub(){}}).view();
 const d=w.document,link=a=>({href:a.getAttribute('href'),text:a.textContent.trim(),blue:a.classList.contains('blue')});
 const next=[...d.querySelectorAll('h2')].find(h=>h.textContent==='Next');
 return {next:next?[...next.parentElement.querySelectorAll('a')].map(link):null,
  links:[...d.querySelectorAll('#connect-body a')].map(link),
  lead:d.querySelector('.account-lead')?.textContent||d.querySelector('#connect-body p').textContent,
  hints:[...d.querySelectorAll('.account-hint')].map(p=>p.textContent.trim())}};
(async()=>{const owner=await draw({id:'owner'}),visitor=await draw(null);
 const block=w.GrinderConnect({db,me:()=>null,app:()=>null}).pasteBlock('TEST-TOKEN');
 process.stdout.write(JSON.stringify({owner,visitor,calls,writes,block}));w.close()})().catch(e=>{console.error(e);process.exit(1)});
"""
    seen = json.loads(subprocess.check_output(["node", "-e", script], cwd=ROOT, text=True))
    owner, visitor = seen["owner"], seen["visitor"]
    # Primary Next CTA is Mine: the first link, and the only blue one. Since 6a12bf4 run
    # discovery is the Feed ("/"), so no other destination, Explore included, is offered first
    # or painted as the primary action.
    assert owner["next"][0] == {"href": "/?mine", "text": "See my runs", "blue": True}
    assert [a["href"] for a in owner["next"]] == ["/?mine", "/", "/?agents", "/?account"]
    assert [a["href"] for a in owner["next"] if a["blue"]] == ["/?mine"]
    assert "/?explore" not in [a["href"] for a in owner["links"]]
    assert owner["lead"] == ("One step: name it, connect, paste the credential once. Private uploads appear in "
                             "My runs. Choose Public when you want a run on the feed.")
    assert {"href": "/?mine", "text": "My runs", "blue": False} in owner["links"]
    assert "Private draft and publish for 30 days. Other audiences stay on Advanced Agents." in owner["hints"]
    # Signed out, the same promise, the same destination, and nothing is created by looking.
    assert {"href": "/?mine", "text": "See my runs", "blue": False} in visitor["links"]
    assert "Private uploads appear in My runs. Choose Public to add one to the feed." in visitor["lead"]
    assert "Signing in never posts a run. Connect tokens stay Only me." in visitor["hints"]
    assert "agent_token_create" not in seen["calls"] and seen["writes"] == []
    # The pasted upload instructions say the same: Only me by default, then My runs.
    assert "Default audience is Only me. After upload open /?mine (My runs). Choose Public to add it to the feed." in seen["block"]
    assert "TEST-TOKEN" in seen["block"] and "/api/agent/runs" in seen["block"]


def test_connect_can_make_existing_agent_public():
    assert "Make Connect agent public" in CONNECT
    assert 'from("grinder_agents")' in CONNECT
    assert 'update({ visibility: "public" })' in CONNECT
    assert "it does not change any run audience" in CONNECT
    assert "Run audiences did not change" in CONNECT
    assert 'eq("name", "Connect")' in CONNECT


def test_advanced_agents_remain_separate():
    assert 'rpc("grinder_issue_agent_token"' in SOCIAL
    assert "async function agents(" in SOCIAL
    assert "connect-banner" not in SOCIAL
    assert "Open Connect" in ACCOUNT
    assert 'href="/?agents"' in ACCOUNT


def test_connect_route_and_account_entry():
    assert "q.has('connect')" in INDEX
    assert 'src="/connect.js"' in INDEX
    assert 'href="/?connect"' in INDEX
    assert "db:sb" in INDEX
    assert "signInGitHub:()=>signInWithGitHub()" in INDEX
