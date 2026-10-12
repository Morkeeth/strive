"""Sample provenance must survive the actual helper URL and the shipped import UI."""
import base64
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlsplit

import pytest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'templates/grokbot/post-agent-run/scripts/preview.py'


def test_copied_kit_runs_without_repository_parent(tmp_path):
    installed = tmp_path / 'bot-workflow' / 'post-agent-run'
    shutil.copytree(ROOT / 'templates/grokbot/post-agent-run', installed)
    result = subprocess.run(
        [sys.executable, str(installed / 'scripts/smoke_test.py')],
        cwd=tmp_path,
        check=True,
        capture_output=True,
        text=True,
    )
    assert result.stdout.startswith('PASS:')


def test_handoff_keeps_complete_url_out_of_bot_output(tmp_path):
    handoff = tmp_path / 'strive-preview-url.txt'
    result = subprocess.run(
        [
            sys.executable,
            str(HELPER),
            str(ROOT / 'samples/sample_grokbot_bot_activity.jsonl'),
            '--handoff',
            str(handoff),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    receipt = json.loads(result.stdout)
    assert 'preview_url' not in receipt
    assert receipt['preview_handoff'] == str(handoff.resolve())
    assert handoff.read_text().startswith('https://striverun.app/#import=')


def preview(path):
    result = subprocess.run([sys.executable, str(HELPER), str(path)],
                            check=True, capture_output=True, text=True)
    data = json.loads(result.stdout)
    assert data['selected_export'] == str(path.resolve())
    assert data['selected_sitting'] == 'latest sitting in selected export'
    token = urlsplit(data['preview_url']).fragment.removeprefix('import=')
    payload = json.loads(base64.b64decode(unquote(token)))
    assert payload == data['metrics']
    return data['preview_url'], payload


@pytest.mark.parametrize('name', ['sample_grokbot_bot_activity.jsonl',
                                 'sample_grokbot_safe_real_shape.jsonl'])
def test_sample_helper_preserves_provenance_and_preview_cannot_save(name):
    url, payload = preview(ROOT / 'samples' / name)
    assert payload['is_sample'] is True
    assert all(value not in json.dumps(payload) for value in
               ['SAFE EXPORT', '/SAFE_EXPORT', '/workspace', 'private_title_prompt'])
    render_import(url, sample=True)


def test_unmarked_export_keeps_normal_save_flow(tmp_path):
    rows = [json.loads(line) for line in
            (ROOT/'samples/sample_grokbot_bot_activity.jsonl').read_text().splitlines()]
    for row in rows:
        row.pop('agentgrinder_sample')
    source = tmp_path/'selected.jsonl'
    source.write_text(''.join(json.dumps(row)+'\n' for row in rows))
    url, payload = preview(source)
    assert 'is_sample' not in payload
    render_import(url, sample=False)


PROBE = ROOT / 'tests/fixtures/import_flow_probe.mjs'


def import_flow(url, **spec):
    """Open the helper's URL in the shipped import preview (jsdom) and press Save once."""
    out = subprocess.run(['node', str(PROBE), str(ROOT), url, json.dumps(spec)],
                         cwd=ROOT, check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def render_import(url, sample):
    seen = import_flow(url)
    # The preview is the post card in its unsaved form: nothing on it links anywhere or acts.
    preview = seen['previewHtml']
    assert '<article class="card ' in preview and 'data-review-card="true"' in preview
    assert seen['previewLinks'] == 0, 'Preview has saved-run controls'
    assert 'Untitled run' not in seen['previewText'] and 'ACHIEVED' not in seen['previewText']
    # Control: the same module gives a saved run its XUDOS button and its links.
    saved = seen['savedActions']
    for text in ('<button class="fc-act kudo"', 'XUDOS', 'Comment', 'Share', '/?run=real-run'):
        assert text in saved, 'Saved run lost ' + text
    assert '<button' not in seen['previewActions'] and 'href=' not in seen['previewActions']
    # The rhythm trace carries the blue token through feed.css when the preview draws one.
    css = (ROOT / 'site/feed.css').read_text()
    if 'class="fc-line"' in preview:
        assert re.search(r'\.fc-line\{[^}]*stroke:var\(--blue\)', css), 'Preview trace lost blue token'
    assert seen['steps'] == ['1Preview', '2Your story', '3Audience']
    if not sample:
        assert seen['heading'] == 'Your imported session' and seen['meta'] == 'Not saved yet'
        assert seen['note'] is None
        assert seen['pubDisabled'] is False, 'Real export save disabled'
        # Signed out, Save keeps the import and asks for sign-in. Nothing is written.
        assert seen['signins'] == 1 and len(seen['stashed']) == 1
        assert seen['inserts'] == [] and seen['updates'] == []
        # Signed in, the same click writes exactly one private run carrying no sample mark.
        owner = import_flow(url, me=True)
        assert owner['signins'] == 0
        assert [(i['table'], i['row']['visibility'], i['row']['profile_id']) for i in owner['inserts']] == [('runs', 'private', 'owner')]
        assert 'is_sample' not in owner['inserts'][0]['row']
        assert owner['viewed'] == ['saved-run'] and owner['location'] == '/?run=saved-run'
        return
    assert seen['heading'] == 'Sample preview', 'Sample provenance not visible'
    assert seen['meta'] == 'Example data · not your activity'
    assert 'cannot be saved or posted' in seen['note']
    assert seen['pubDisabled'] is True and seen['pubLabel'] == 'Sample - preview only', 'Sample save not disabled'
    # The denied save is denied twice: the button is disabled, and the handler refuses a sample
    # on its own. unlock removes the disabled attribute, so the click reaches the handler.
    # Signed out it must not ask for sign-in; signed in it must not read or write a run.
    for spec in ({}, {'unlock': True}, {'me': True}, {'me': True, 'unlock': True}):
        denied = import_flow(url, **spec)
        assert denied['signins'] == 0 and denied['stashed'] == [], 'Sample reached sign-in'
        assert denied['lookups'] == [] and denied['inserts'] == [] and denied['updates'] == [], 'Sample reached save'
        assert denied['photoDraftSaves'] == 0 and denied['fairConfirms'] == [] and denied['viewed'] == []
        assert denied['statuses'] == [{'text': 'Samples are preview-only. Capture your own session to save a run.', 'bad': True}]
        assert denied['location'].startswith('/#import=')


def test_captured_sample_draft_keeps_provenance_on_public_export(tmp_path):
    from agentgrinder.capture import connect, scan
    from agentgrinder.push import export_run
    db = connect(tmp_path/'capture')
    try:
        result = scan(db, [('grokbot', ROOT/'samples/sample_grokbot_bot_activity.jsonl')])
        assert result['created'] == 1
        stored = json.loads(db.execute('select payload from drafts').fetchone()[0])
        exported = export_run(stored)
        assert exported['is_sample'] is True
        assert 'private_title_prompt' not in exported
        assert '/workspace' not in json.dumps(exported)
    finally:
        db.close()
