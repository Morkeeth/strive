import copy
import json
from pathlib import Path

import pytest

from agentgrinder import route_capture as route, route_landmarks as landmarks
from agentgrinder.code_route import validate_checkpoint_source, validate_code_route
from test_route_capture import setup, command, append


def source(**changes):
    return {'v':1, 'consent':'explicit', 'commits':[], 'files_changed':1, **changes}


@pytest.mark.parametrize('bad', [
    source(v=True), source(consent='implicit'), source(files_changed=True), source(unknown='field'),
    source(files=['../escape']), source(files=['/Users/person/work']), source(files=['a/../b']),
    source(files=['a\\b']), source(files=['.env']), source(files=['a/token.json']),
    source(files=['a', 'a']), source(files=[' file.py']), source(files=None),
    source(commits=[{'sha':'a'*40, 'subject':'Fix password leak'}]),
    source(commits=[{'sha':'a'*40, 'subject':None}]),
    source(commits=[{'sha':'a'*40, 'subject':' padded '}]),
    source(commits=[{'sha':'a'*40, 'subject':'Fix /Users/person/work'}]),
    source(commits=[{'sha':'a'*40, 'subject':'Read /home/person/work'}]),
    source(commits=[{'sha':'a'*40, 'subject':'Rotate ghp_'+'a'*36}]),
    source(commits=[{'sha':'a'*40, 'url':'https://github.com/a/b/commit/'+'b'*40}]),
    source(commits=[{'sha':'a'*40, 'url':'https://github.com/../b/commit/'+'a'*40}]),
    source(commits=[{'sha':'a'*40, 'url':'https://github.com/a/b/commit/'+'a'*40+'?auth=x'}]),
])
def test_source_rejects_unsafe_or_ambiguous_details(bad):
    with pytest.raises(ValueError): validate_checkpoint_source(bad)


def test_new_opt_in_landmarks_are_frozen_and_legacy_journals_unchanged(tmp_path, monkeypatch):
    root, repo, native, old, projects = setup(tmp_path)
    enriched = tmp_path/'enriched'
    capture = route.start(enriched, projects, native, 'codex', True, True, True)['capture']
    (repo/'work.py').write_text('necessary fixture edit')
    append(native)
    route.checkpoint(enriched, capture)
    command(repo, 'add', 'work.py'); command(repo, 'commit', '-m', 'Explain the actual captured work')
    digest = command(repo, 'rev-parse', 'HEAD')
    route.checkpoint(enriched, capture)
    route.checkpoint(root, old)
    payload = route.freeze(enriched, capture)['payload']
    edit, commit = payload['code_route']['stops']
    assert edit['source'] == source(files=['work.py'])
    assert commit['source']['commits'] == [{'sha':digest, 'subject':'Explain the actual captured work'}]
    assert 'url' not in commit['source']['commits'][0]
    assert all('source' not in s for s in route.freeze(root, old)['payload']['code_route']['stops'])
    monkeypatch.setattr(landmarks, 'collect', lambda *args: pytest.fail('Frozen review resampled sources'))
    assert route.freeze(enriched, capture)['payload'] == payload
    bad = copy.deepcopy(payload['code_route']); bad['stops'][1]['source']['commits'][0]['sha'] = 'a'*40
    with pytest.raises(ValueError, match='evidence SHA'): validate_code_route(bad)
    bad = copy.deepcopy(payload['code_route']); bad['stops'][0]['source']['commits'] = [{'sha':digest}]
    with pytest.raises(ValueError, match='edit checkpoint'): validate_code_route(bad)


def test_public_link_needs_explicit_exact_origin_and_public_exact_commit(tmp_path, monkeypatch):
    root, repo, native, _, projects = setup(tmp_path)
    bound = [{'id':'p1', **projects[0]}]
    monkeypatch.setattr(landmarks, 'public_json', lambda path: pytest.fail('Consent setup must not fetch'))
    command(repo, 'remote', 'add', 'origin', 'git@github.com:Example/Orchard.git')
    settings = landmarks.permissions(bound, True, True, ['Orchard=https://github.com/Example/Orchard'])
    with pytest.raises(ValueError, match='match'): landmarks.permissions(bound, True, True, ['Orchard=https://github.com/Example/Other'])
    digest = 'a'*40; url = 'https://github.com/Example/Orchard'; calls = []
    responses = [{'private':False, 'full_name':'Example/Orchard', 'html_url':url}, {'sha':digest, 'html_url':url+'/commit/'+digest}]
    def public(path):
        calls.append(path)
        return responses[len(calls)-1]
    monkeypatch.setattr(landmarks, 'public_json', public)
    assert landmarks.verified_urls(url, [digest]) == {digest:url+'/commit/'+digest}
    assert calls == ['/repos/Example/Orchard', '/repos/Example/Orchard/git/commits/'+digest]
    calls.clear(); responses[0]['private'] = True
    assert landmarks.verified_urls(url, [digest]) == {} and len(calls) == 1
    calls.clear(); responses[0]['private'] = False; responses[1]['sha'] = 'b'*40
    assert landmarks.verified_urls(url, [digest]) == {}
    monkeypatch.setattr(landmarks, 'public_json', lambda path: (_ for _ in ()).throw(OSError('unavailable')))
    assert landmarks.verified_urls(url, [digest]) == {}


def test_secret_descriptions_omitted_and_same_repository_aliases_refused(tmp_path):
    _, repo, native, _, projects = setup(tmp_path)
    command(repo, 'commit', '--allow-empty', '-m', 'Rotate secret password')
    digest = command(repo, 'rev-parse', 'HEAD')
    value = landmarks.collect({'id':'p1', **projects[0]}, {'commit_subjects':True, 'file_names':True, 'public_repos':{}}, ['work.py', '.env', 'credentials/token.json'], [digest])
    assert value == source(files_changed=3, files=['work.py'], commits=[{'sha':digest}])
    second = tmp_path/'another-worktree'
    command(repo, 'worktree', 'add', '-b', 'other', str(second))
    with pytest.raises(ValueError, match='distinct repositories'):
        route.start(tmp_path/'duplicate', projects+[{'name':'Renamed', 'root':str(second)}], native, 'codex', True)


def test_landmark_checkpoint_limit_does_not_commit_partial_journal(tmp_path):
    _, repo, native, _, projects = setup(tmp_path)
    root = tmp_path/'bounded'; capture = route.start(root, projects, native, 'codex', True, True)['capture']
    path = root/'routes'/capture/'journal.json'; before = path.read_bytes()
    for n in range(6): command(repo, 'commit', '--allow-empty', '-m', 'Fixture '+str(n))
    with pytest.raises(ValueError, match='at most 5'): route.checkpoint(root, capture)
    assert path.read_bytes() == before
