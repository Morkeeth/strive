"""The Connect page tells a phone the truth: the session file is on the computer the agent ran on.

Until 25 Sep 2026 this lived in a four-step onboarding wizard at /?onboard. That wizard is gone;
/?onboard, /?connect and the top of /?post are one page. The phone honesty moved with it.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'site/index.html').read_text()


def connect_body():
    return HTML[HTML.index('function connectBodyHtml()'):HTML.index('function wireConnectCopies(')]


def drawn():
    """The page body as the shipped code draws it, with each agent button pressed once."""
    return json.loads(subprocess.check_output(
        ['node', str(ROOT / 'tests/fixtures/connect_body_probe.mjs'), str(ROOT)], cwd=ROOT, text=True))


PICKER = 'uvx --from __CAPTURE_PACKAGE__ strive sessions --harness {} --open --site __ORIGIN__'


def test_connect_leads_with_computer_capture():
    page = drawn()
    # The page opens on capture from the computer, ahead of the file drop and the setup fold.
    assert page['order'] == sorted(page['order']) and page['order'][0] == 0
    assert page['intro'] == 'Open a local session picker, then check your private preview. Nothing is saved online yet.'
    assert page['steps'] == ['1Choose your agent', '2Pick a session', '3Private preview']
    assert page['before'] == {'quick': False, 'agent': False}
    # Choosing an agent shows one command to copy, and says which computer to run it on.
    for source, name in (('cursor', 'Cursor'), ('claude', 'Claude Code'), ('codex', 'Codex')):
        pick = page['picks'][source]
        assert pick['quick'] is True and pick['agent'] is False
        assert pick['title'] == f'Copy to Terminal to open your {name} session picker'
        assert pick['copyLabel'] == 'Copy command'
        assert pick['command'] == pick['copy'] == PICKER.format(source)
    assert 'Copy this command into Terminal on the computer where you worked.' in page['quickText']
    assert 'Pick your session to prepare its private preview.' in page['quickText']
    assert 'This website cannot read your disk.' in page['quickText']
    assert 'prompts and session files stay on your computer' in page['quickText']


def test_one_page_auto_capture_with_advanced_import():
    # The page no longer leads with the freshest-session command: since dc6cc32 each agent
    # opens a local session picker (`strive sessions`). The auto command is kept on the same
    # page under Import setup, with the file drop and the agent guide.
    body = connect_body()
    page = drawn()
    assert "dropHtml:dropZoneHtml()" in body
    assert "['cursor','claude','codex'].map(h=>[h,picker(h)])" in body
    assert [(s['source'], s['name'], s['command']) for s in page['sources']] == [
        ('cursor', 'Cursor', PICKER.format('cursor')), ('claude', 'Claude Code', PICKER.format('claude')),
        ('codex', 'Codex', PICKER.format('codex')), ('grok', 'Grok Bot', None),
        ('bb', 'bb', 'bb thread log --self --all --json > bb-session.json')]
    # The file drop is on the same page, folded, with the three places a session file lives.
    entry = page['fileEntry']
    assert entry['zone'] is True and entry['input'] == 'file' and entry['open'] is False
    assert entry['summary'] == 'Or drop a session file'
    assert entry['folders'] == ['~/.claude/projects/', '~/.cursor/projects/', '~/.codex/sessions/',
                                'bb thread log --self --all --json > bb-session.json']
    assert entry['zoneText'].endswith('Read on this device. Nothing is saved until you choose to save it.')
    # Advanced: the freshest-session command survives as the terminal route, closed by default.
    setup = page['setup']
    assert setup['open'] is False and setup['summary'].startswith('Import setup')
    assert setup['tabs'] == ['Editor plugin', 'Terminal', 'Automatic imports', 'Find a session']
    assert "const capture=ONE_LINE('auto')" in body
    assert setup['terminalCommand'] == setup['terminalCopy'] == (
        'uvx --from __CAPTURE_PACKAGE__ agentgrinder grind --harness auto --push --open --no-rank --no-series --push-url __ORIGIN__')
    assert 'Run this where you build.' in setup['terminal'] and 'then open the private preview link' in setup['terminal']
    assert "uvx --from __CAPTURE_PACKAGE__ agentgrinder grind" in HTML
    for path in ("~/.claude/projects/", "~/.cursor/projects/", "~/.codex/sessions/"):
        assert path in HTML and path in setup['files']
    # No account for the preview; sign-in only to save. No email, no mailto.
    assert page['hints'] == ['You can preview without signing in. Nothing is saved until you choose to save it.']
    assert "mailto:" not in page['body'] and "signInWithOtp" not in page['body'] and "mailto:" not in body
    assert all(not link['href'].startswith('mailto:') for link in page['links'])
    # Bots and unsupported agents have documented paths: Grok is asked through the agent guide.
    assert {'href': '/agents.md', 'text': 'MCP, Grok and other agent instructions'} in page['links']
    assert {'href': '/agents.md', 'text': 'Choose an exact session'} in page['links']
    grok = page['picks']['grok']
    assert grok['quick'] is False and grok['agent'] is True
    assert grok['agentCopy'] == ('Open https://strive.test/agents.md and help me preview this session on STRIVE. '
                                 'Keep it local until I choose to save it.')


def test_onboard_and_connect_and_post_are_the_same_page():
    assert "async function viewOnboard(){ return viewConnect(); }" in HTML
    assert "if(q.get('connect')==='auto')" in HTML
    post = HTML[HTML.index("async function viewPost(){"):HTML.index("async function viewExplore(){")]
    assert "${connectBodyHtml()}" in post
    assert "firstRunPrompt" not in HTML and "FIRST_RUN_CMD" not in HTML
