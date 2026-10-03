import json
import os

from agentgrinder.cli import main


def transcript(root, project, session, mtime):
    path = root / project / 'agent-transcripts' / session / (session + '.jsonl')
    path.parent.mkdir(parents=True)
    rows = []
    for hour in ('09', '12'):
        rows.extend([
            {'role': 'user', 'message': {'content': [{'type': 'text', 'text': f'<timestamp>2026-10-03T{hour}:00:00Z</timestamp><user_query>PRIVATE BODY</user_query>'}]}},
            {'role': 'assistant', 'message': {'content': [{'type': 'tool_use', 'name': 'Read', 'input': {'path': '/tmp/demo.py'}}]}},
        ])
    path.write_text('\n'.join(json.dumps(row) for row in rows))
    os.utime(path, (mtime, mtime))
    return path


def setup_sources(tmp_path, monkeypatch):
    import agentgrinder.ingest as ingest
    root = tmp_path / 'projects'
    older = transcript(root, 'Users-alice-actual-work', 'older-own', 100)
    newer = transcript(root, 'Users-alice-other-work', 'newer-other', 200)
    monkeypatch.setattr(ingest, 'CURSOR_GLOB', str(root / '*/agent-transcripts/*/*.jsonl'))
    for name in ('CHATS', 'DB', 'WORKSPACES'):
        monkeypatch.setenv('AGENTGRINDER_CURSOR_' + name, str(tmp_path / ('absent-' + name)))
    return older, newer


def test_discovery_lists_other_workspace_without_reading_bodies(tmp_path, monkeypatch, capsys):
    from pathlib import Path
    older, newer = setup_sources(tmp_path, monkeypatch)
    def forbidden(*args, **kwargs):
        raise AssertionError('Discovery must not open transcript bodies or databases')
    monkeypatch.setattr(Path, 'open', forbidden)
    assert main(['grind', '--harness', 'cursor', '--list', '--show-paths', '--list-limit', '1']) == 0
    page = json.loads(capsys.readouterr().out)
    assert page['total'] == 2 and page['next_offset'] == 1
    assert page['candidates'][0]['source'] == str(newer)
    assert main(['grind', '--harness', 'cursor', '--list', '--show-paths', '--list-limit', '1', '--list-offset', '1']) == 0
    page = json.loads(capsys.readouterr().out)
    assert page['next_offset'] is None
    assert page['candidates'][0]['source'] == str(older)
    assert page['candidates'][0]['project'] == 'actual-work'
    assert 'PRIVATE BODY' not in json.dumps(page)


def test_discovery_hides_paths_and_bounds_output(tmp_path, monkeypatch, capsys):
    setup_sources(tmp_path, monkeypatch)
    assert main(['grind', '--harness', 'cursor', '--list']) == 0
    result = json.loads(capsys.readouterr().out)
    assert all(x['source_path_hidden'] and '/' not in x['source'] for x in result['candidates'])
    for options in (['--list-limit', '0'], ['--list-limit', '101'], ['--list-offset', '-1']):
        assert main(['grind', '--harness', 'cursor', '--list'] + options) == 1
        assert '1..100' in capsys.readouterr().err


def test_explicit_older_source_and_sitting_remain_selected(tmp_path, monkeypatch, capsys):
    import agentgrinder.cli as cli
    from agentgrinder.contract import capture_digest
    older, newer = setup_sources(tmp_path, monkeypatch)
    assert main(['grind', str(older), '--harness', 'cursor', '--list', '--show-paths']) == 0
    rows = json.loads(capsys.readouterr().out)
    assert [x['sitting'] for x in rows] == [1, 2]
    assert all(x['selected_session']['source'] == str(older) for x in rows)
    captured = []
    def output(run, args, path, digest, selected, total):
        captured.append((run, path, digest, selected, total))
        return 0
    monkeypatch.setattr(cli, '_native_grind', output)  # observe final render boundary
    for pick, hour in [('1', '09'), ('-1', '12')]:
        assert main(['grind', str(older), '--harness', 'cursor', '--pick', pick]) == 0
        run, path, digest, selected, total = captured[-1]
        assert path == str(older) and digest == capture_digest(older)
        assert run['started'] == f'2026-10-03T{hour}:00:00+00:00'
        assert run['turns_typed'] == 1 and total == 2
    assert main(['grind', str(older), '--harness', 'cursor', '--pick', '3']) == 1
    assert len(captured) == 2


def test_no_implicit_cursor_capture_even_with_auto_or_push(tmp_path, monkeypatch, capsys):
    import agentgrinder.flex as flex
    import agentgrinder.cli as cli
    _, newer = setup_sources(tmp_path, monkeypatch)
    monkeypatch.setattr(flex, 'latest_any', lambda: ('cursor', str(newer)))
    def forbidden(*args, **kwargs):
        raise AssertionError('No capture without explicit source selection')
    monkeypatch.setattr(cli, '_native_grind', forbidden)
    for harness in ('cursor', 'auto'):
        assert main(['grind', '--harness', harness, '--push']) == 1
        assert 'Select your Cursor transcript explicitly' in capsys.readouterr().err


def test_empty_discovery_is_explicit_without_inventing_a_session(tmp_path, monkeypatch, capsys):
    import agentgrinder.ingest as ingest
    monkeypatch.setattr(ingest, 'CURSOR_GLOB', str(tmp_path / 'absent/*/*.jsonl'))
    assert main(['grind', '--harness', 'cursor', '--list']) == 0
    page = json.loads(capsys.readouterr().out)
    assert page['candidates'] == [] and page['total'] == 0 and page['next_offset'] is None
