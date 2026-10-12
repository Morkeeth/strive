"""Tree builder against a synthetic Cursor store. No real data: every row is invented here."""
import json
import sqlite3
from pathlib import Path

import pytest

from agentgrinder import cursor_tree

PARENT = 'aaaaaaaa-0000-0000-0000-000000000001'
WORKERS = ['bbbbbbbb-0000-0000-0000-00000000000%d' % i for i in (1, 2, 3)]


def bubble(created, tool=None, model=None, text='PRIVATE TEXT MUST NOT LEAK', args='/secret/path.py'):
    row = {'createdAt': created, 'type': 2, 'text': text, 'tokenCount': {'inputTokens': 0, 'outputTokens': 0}}
    if tool:
        row['toolFormerData'] = {'name': tool, 'status': 'error' if tool == 'bad' else 'completed', 'rawArgs': args}
    if model:
        row['modelInfo'] = {'modelName': model}
    return row


def make_store(folder: Path) -> Path:
    db = folder / 'state.vscdb'
    conn = sqlite3.connect(db)
    conn.execute('create table cursorDiskKV (key text primary key, value blob)')
    conn.execute('create table composerHeaders (composerId text primary key, workspaceId text, isSubagent integer, subagentTypeName text)')
    rows = {}
    rows['composerData:' + PARENT] = {
        'composerId': PARENT, 'createdAt': 1700000000000, 'lastUpdatedAt': 1700009000000, 'status': 'completed',
        'name': 'secret session title', 'text': 'secret draft prompt',
        'modelConfig': {'modelName': 'default', 'selectedModels': [{'modelId': 'default'}]},
        'subagentComposerIds': WORKERS + ['cccccccc-0000-0000-0000-000000000009'], 'usageData': {}}
    rows['bubbleId:%s:1' % PARENT] = bubble('2026-01-01T10:00:00.000Z', model='fable-x')
    # The store's own record of the commit, at 10:20 in a 10:00 to 10:30 window, so bin 33 of 50.
    # The transcript puts the SAME commit at call index 1 of 2, and looking index 1 up in the
    # store's tool order lands on the 10:30 bubble, bin 49. The fixture is deliberately built so
    # the two rules cannot agree. A fixture whose two sides come from one list cannot fail here.
    rows['bubbleId:%s:2' % PARENT] = bubble('2026-01-01T10:20:00.000Z', tool='run_terminal_command_v2',
                                            model='fable-x', args='{"command":"git commit -m safe"}')
    rows['bubbleId:%s:3' % PARENT] = bubble('2026-01-01T10:30:00.000Z', tool='bad', model='other-y')
    configs = [
        ({'modelName': 'sonnet-z', 'selectedModels': [{'modelId': 'sonnet-z'}]}, 'explore', 'completed'),
        ({'modelName': 'opus-w', 'selectedModels': [{'modelId': 'default'}]}, 'generalPurpose', 'aborted'),
        ({'modelName': 'grok-v', 'selectedModels': [{'modelId': 'grok-v'}]}, 'my private agent name', 'completed'),
    ]
    for worker, (config, kind, status) in zip(WORKERS, configs):
        rows['composerData:' + worker] = {
            'composerId': worker, 'createdAt': 1700000100000, 'lastUpdatedAt': 1700000200000, 'status': status,
            'modelConfig': config, 'subagentComposerIds': [], 'text': 'worker prompt /Users/nobody/private',
            'subagentInfo': {'subagentTypeName': kind, 'parentComposerId': PARENT}}
        rows['bubbleId:%s:1' % worker] = bubble('2026-01-01T10:01:00.000Z')
        rows['bubbleId:%s:2' % worker] = bubble('2026-01-01T10:03:00.000Z', tool='read_file_v2')
    # a worker whose bubbles carry no timestamps falls back to composer timestamps
    rows['composerData:' + WORKERS[2]]['createdAt'] = 1700000100000
    del rows['bubbleId:%s:1' % WORKERS[2]]
    del rows['bubbleId:%s:2' % WORKERS[2]]
    rows['bubbleId:%s:1' % WORKERS[2]] = {'type': 2, 'text': 'no stamp'}
    # a lone composer with no delegation, so --list must not show it
    rows['composerData:dddddddd-0000-0000-0000-000000000004'] = {'composerId': 'd', 'subagentComposerIds': []}
    conn.executemany('insert into cursorDiskKV values (?,?)', [(k, json.dumps(v)) for k, v in rows.items()])
    conn.execute('insert into composerHeaders values (?,?,?,?)', (PARENT, 'ws-1', 0, None))
    for worker in WORKERS:
        conn.execute('insert into composerHeaders values (?,?,?,?)', (worker, 'ws-1', 1, 'generalPurpose'))
    conn.commit()
    conn.close()
    storage = folder / 'workspaceStorage' / 'ws-1'
    storage.mkdir(parents=True)
    (storage / 'workspace.json').write_text(json.dumps({'folder': 'file:///Users/nobody/CODE/My%20Project'}))
    return db


@pytest.fixture
def store(tmp_path):
    return make_store(tmp_path)


def test_list_shows_only_parents_with_workers(store, tmp_path):
    with cursor_tree.CopiedDb(store) as conn:
        parents = cursor_tree.list_parents(conn, tmp_path / 'workspaceStorage')
    assert [p['composer_id'] for p in parents] == [PARENT]
    assert parents[0]['workers'] == 4
    assert parents[0]['project'] == 'My Project'
    assert parents[0]['model'] == 'fable-x'
    assert parents[0]['wall_seconds'] == 1800.0


def test_tree_shape_models_timing_and_counts(store, tmp_path):
    with cursor_tree.CopiedDb(store) as conn:
        tree = cursor_tree.build_tree(conn, PARENT, tmp_path / 'workspaceStorage')
    assert tree['role'] == 'orchestrator' and tree['project'] == 'My Project'
    assert tree['model'] == 'fable-x' and tree['model_source'] == 'bubble-modelInfo'
    assert (tree['bubbles'], tree['tool_calls'], tree['tool_errors']) == (3, 2, 1)
    assert tree['wall_seconds'] == 1800.0 and tree['wall_basis'] == 'bubble-createdAt'
    assert tree['tokens'] is None
    assert tree['workers_missing'] == 1
    workers = tree['children']
    assert [w['composer_id'] for w in workers] == WORKERS
    assert all(w['role'] == 'worker' and w['project'] == 'My Project' for w in workers)
    assert [w['model'] for w in workers] == ['sonnet-z', 'opus-w', 'grok-v']
    assert workers[0]['model_source'] == 'composer-modelConfig'
    assert 'model_selected' not in workers[0]
    assert workers[1]['model_selected'] == 'default'
    assert [w['subagent_type'] for w in workers] == ['explore', 'generalPurpose', 'other']
    assert workers[0]['wall_seconds'] == 120.0 and workers[0]['tool_calls'] == 1 and workers[0]['bubbles'] == 2
    assert workers[1]['status'] == 'aborted'
    assert workers[2]['wall_basis'] == 'composer-timestamps' and workers[2]['wall_seconds'] == 100.0


def test_tree_carries_no_text_paths_or_private_names(store, tmp_path):
    with cursor_tree.CopiedDb(store) as conn:
        tree = cursor_tree.build_tree(conn, PARENT, tmp_path / 'workspaceStorage')
    dumped = json.dumps(tree)
    for private in ['secret', 'PRIVATE TEXT', 'rawArgs', '/Users', 'nobody', 'CODE', 'my private agent name', 'no stamp']:
        assert private not in dumped
    assert 'file:' not in dumped


def test_redaction_guard_refuses_path_shaped_strings():
    with pytest.raises(ValueError):
        cursor_tree.assert_redacted({'children': [{'project': 'a/b'}]})
    with pytest.raises(ValueError):
        cursor_tree.assert_redacted({'model': '~home'})
    cursor_tree.assert_redacted({'started_at': '2026-01-01T00:00:00Z', 'project': 'plain name'})


def test_source_store_is_copied_not_opened_live(store, tmp_path):
    before = store.stat().st_mtime_ns
    with cursor_tree.CopiedDb(store) as conn:
        with pytest.raises(sqlite3.OperationalError):
            conn.execute("insert into cursorDiskKV values ('x','y')")
    assert store.stat().st_mtime_ns == before


def test_absent_store_gives_a_clear_message(tmp_path, capsys):
    missing = tmp_path / 'nowhere' / 'state.vscdb'
    assert cursor_tree.main(['--list', '--db', str(missing)]) == 2
    err = capsys.readouterr().err
    assert 'Cursor local store not found' in err and '--db' in err


def test_cli_list_and_json(store, tmp_path, capsys):
    storage = str(tmp_path / 'workspaceStorage')
    assert cursor_tree.main(['--list', '--db', str(store), '--workspace-storage', storage]) == 0
    out = capsys.readouterr().out
    assert PARENT in out and 'My Project' in out and '30m 00s' in out
    assert 'dddddddd' not in out
    assert cursor_tree.main(['--json', PARENT, '--db', str(store), '--workspace-storage', storage]) == 0
    tree = json.loads(capsys.readouterr().out)
    assert len(tree['children']) == 3
    assert cursor_tree.main(['--json', 'ffffffff-0000-0000-0000-000000000000', '--db', str(store)]) == 1


def test_unknown_workspace_gives_no_project(store, tmp_path):
    with cursor_tree.CopiedDb(store) as conn:
        assert cursor_tree.project_name(conn, PARENT, tmp_path / 'elsewhere') is None
        assert cursor_tree.project_name(conn, 'not-a-composer', tmp_path / 'workspaceStorage') is None


def test_worker_bins_come_from_tree_fixture(store):
    with cursor_tree.CopiedDb(store) as conn:
        ridge = cursor_tree.build_ridge(conn, PARENT)
    assert ridge['ridge_basis'] == 'wall-time'
    assert sum(ridge['ridge']) == 2
    assert len(ridge['worker_bins']) == len(ridge['ridge']) == 50
    assert max(ridge['worker_bins']) == 2
    assert any(value == 0 for value in ridge['worker_bins'])


def test_cursor_capture_joins_transcript_counts_to_database_clock(store, tmp_path, monkeypatch):
    from agentgrinder.ingest import parse_cursor_session
    transcript_dir = tmp_path / 'project' / 'agent-transcripts' / PARENT
    transcript_dir.mkdir(parents=True)
    transcript = transcript_dir / 'session.jsonl'
    transcript.write_text('\n'.join([
        json.dumps({'role': 'user', 'message': {'content':
            '<timestamp>Tuesday, Sep 15, 2026, 10:00 AM (UTC)</timestamp>'
            '<user_query>PRIVATE MESSAGE</user_query>'}}),
        json.dumps({'role': 'assistant', 'message': {'content': [
            {'type': 'tool_use', 'name': 'Read', 'input': {'path': '/private/one'}},
            {'type': 'tool_use', 'name': 'Shell', 'input': {'command': 'git commit -m safe'}},
        ]}}),
    ]))
    monkeypatch.setenv(cursor_tree.ENV_DB, str(store))
    def no_copy(*args, **kwargs):
        raise OSError('no free space: a capture must not copy the global store')
    monkeypatch.setattr(cursor_tree.shutil, 'copyfile', no_copy)
    run = parse_cursor_session(str(transcript))
    assert run['ridge_basis'] == 'wall-time'
    assert run['ridge_wall_seconds'] == run['duration_s'] == 1800.0
    assert sum(run['ridge']) == run['tool_calls'] == 2
    assert max(run['worker_bins']) == 2
    assert len(run['commit_bins']) == run['commits'] == 1
    # The clock, not the transcript index. Bin 33 is 10:20 in a 10:00 to 10:30 window. The old
    # rule read the transcript's call index 1 out of the store's tool order and answered 49.
    assert run['commit_bins'] == [33]
    assert run['commit_basis'] == 'wall-time'
    assert run['ridge_source'] == 'cursor-global-store'
    assert 'PRIVATE MESSAGE' not in json.dumps({
        key: value for key, value in run.items() if not key.startswith('private_')})


def test_readonly_snapshot_sees_wal_and_rejects_writes(tmp_path):
    store = tmp_path / 'space # unicode ü.vscdb'
    writer = sqlite3.connect(store)
    writer.execute('pragma journal_mode=wal')
    writer.execute('create table cursorDiskKV (key text primary key, value blob)')
    writer.execute("insert into cursorDiskKV values ('one','committed in WAL')")
    writer.commit()
    try:
        assert Path(str(store) + '-wal').stat().st_size > 0
        with cursor_tree.ReadOnlyDb(store) as reader:
            assert reader.execute('select value from cursorDiskKV').fetchone()[0] == 'committed in WAL'
            with pytest.raises(sqlite3.OperationalError):
                reader.execute("insert into cursorDiskKV values ('forbidden','write')")
            writer.execute("update cursorDiskKV set value='new commit'")
            writer.commit()
            assert reader.execute('select value from cursorDiskKV').fetchone()[0] == 'committed in WAL'
        with cursor_tree.ReadOnlyDb(store) as reader:
            assert reader.execute('select value from cursorDiskKV').fetchone()[0] == 'new commit'
            assert reader.execute('select count(*) from cursorDiskKV').fetchone()[0] == 1
    finally:
        writer.close()


def test_readonly_missing_store_is_not_created(tmp_path):
    store = tmp_path / 'missing.vscdb'
    with pytest.raises(FileNotFoundError):
        with cursor_tree.ReadOnlyDb(store):
            pass
    assert not store.exists()


def test_locked_global_store_keeps_jsonl_counts_and_names_fallback(store, tmp_path, monkeypatch):
    from agentgrinder.ingest import parse_cursor_session
    from agentgrinder import cursor_chats
    folder = tmp_path / PARENT
    folder.mkdir()
    transcript = folder / 'session.jsonl'
    transcript.write_text(json.dumps({'role':'user','message':{'content':'<user_query>test</user_query>'}})+'\n'+json.dumps({'role':'assistant','message':{'content':[
        {'type':'tool_use','name':'Read','input':{'path':'private.txt'}},
        {'type':'tool_use','name':'Shell','input':{'command':'echo test'}}]}})+'\n')
    monkeypatch.setattr(cursor_chats, 'build_ridge', lambda *args: None)
    writer = sqlite3.connect(store)
    writer.execute('BEGIN EXCLUSIVE')
    try:
        run = parse_cursor_session(str(transcript), cursor_db=store)
        assert run['tool_calls'] == 2
        assert run['ridge_source'] == 'call-index'
        assert run['ridge_basis'] == 'call-index'
        assert run['ridge_tool_calls'] is None
        assert run['cursor_store_status'] == 'busy-jsonl-fallback'
    finally:
        writer.rollback()
        writer.close()
