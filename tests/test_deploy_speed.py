"""Missing paint and wrong deployed objects must fail, without losing history."""
import importlib.util
import asyncio
from types import SimpleNamespace
import io
import json
from pathlib import Path
import pytest

spec = importlib.util.spec_from_file_location('deploy_speed', Path(__file__).parents[1] / 'scripts/check-deploy-speed.py')
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)


def sample(n):
    return dict(lcp_ms=n, ttfb_ms=10, external_script_encoded_bytes=100, stylesheet_encoded_bytes=50, supabase_requests=9)


def test_missing_paint_is_not_fast():
    for bad in [None, 0, float('nan')]:
        with pytest.raises(ValueError):
            S.aggregate([sample(100), sample(bad), sample(300)])
    assert S.aggregate([sample(300), sample(100), sample(200)])['lcp_ms'] == 200


def test_sha_mismatch_refuses_attribution(monkeypatch):
    class Response(io.BytesIO):
        def geturl(self):
            return 'https://striverun.app/api/health'
    monkeypatch.setattr(S.urllib.request, 'build_opener', lambda *a: SimpleNamespace(open=lambda *a, **k: Response(json.dumps({'git_sha':'a'*40}).encode())))
    assert S.health('https://striverun.app','a'*40) == 'a'*40
    with pytest.raises(ValueError):
        S.health('https://striverun.app','b'*40)
    with pytest.raises(ValueError):
        S.sha('main')


def test_failure_and_history_are_preserved(tmp_path):
    S.store(tmp_path/'first', {'sha':'a'*40,'status':'failed','method':S.METHOD})
    S.store(tmp_path/'second', {'sha':'b'*40,'status':'measured','profiles':{'desktop':{'lcp_ms':400},'phone-4g':{'lcp_ms':900}}}, tmp_path/'first/history.json')
    rows=json.loads((tmp_path/'second/history.json').read_text())
    assert [r['status'] for r in rows] == ['failed','measured']
    assert rows[-1]['prior_entries']==1 and rows[-1]['history_continuity']=='restored'
    assert '400,900' in (tmp_path/'second/history.csv').read_text()


def test_page_meta_mismatch_refuses_attribution():
    class Page:
        url = 'https://striverun.app/'
        def locator(self, selector):
            assert selector == 'meta[name="strive-git-sha"]'
            return self
        async def get_attribute(self, name):
            assert name == 'content'
            return 'a' * 40
    asyncio.run(S.page_identity(Page(), 'a' * 40))
    with pytest.raises(ValueError, match='Page SHA differs'):
        asyncio.run(S.page_identity(Page(), 'b' * 40))


def test_main_writes_failed_record_without_exception_text(tmp_path, monkeypatch):
    S.store(tmp_path / 'before', {'status': 'measured', 'sha': 'a' * 40})
    def fail(*args):
        raise RuntimeError('https://example.invalid/?secret=must-not-be-stored')
    monkeypatch.setattr(S, 'health', fail)
    result = S.main(['--sha', 'b' * 40, '--out', str(tmp_path / 'after'), '--previous', str(tmp_path / 'before/history.json')])
    assert result == 1
    record = json.loads((tmp_path / 'after/measurement.json').read_text())
    assert record['status'] == 'failed' and record['error_type'] == 'RuntimeError'
    assert 'profiles' not in record
    assert record['prior_entries'] == 1
    for path in (tmp_path / 'after').iterdir():
        assert 'must-not-be-stored' not in path.read_text()
    assert len(json.loads((tmp_path / 'after/history.json').read_text())) == 2


def test_redirects_reject_other_hosts_before_request():
    handler = S.ProductionRedirect()
    request = S.urllib.request.Request('https://striverun.app/api/health')
    for url in ['https://evil.invalid/api/health', 'http://striverun.app/', 'https://striverun.app.evil.invalid/', 'https://user@striverun.app/', 'https://striverun.app:444/']:
        with pytest.raises(ValueError):
            handler.redirect_request(request, None, 302, 'Moved', {}, url)
    assert handler.redirect_request(request, None, 302, 'Moved', {}, 'https://striverun.app/health').full_url == 'https://striverun.app/health'


def test_history_prunes_oldest_and_keeps_latest_under_cap(tmp_path):
    previous = tmp_path / 'old.json'
    previous.write_text(json.dumps([{'sha': 'a' * 40, 'padding': 'x' * 5_100_000}, {'sha': 'b' * 40, 'padding': 'x' * 5_100_000}]))
    assert previous.stat().st_size > S.HISTORY_LIMIT
    out = tmp_path / 'next'
    S.store(out, {'sha': 'c' * 40, 'status': 'failed'}, previous)
    rows = json.loads((out / 'history.json').read_text())
    assert [row['sha'] for row in rows] == ['b' * 40, 'c' * 40]
    assert rows[-1]['pruned_oldest_entries'] == 1
    assert sum((out / name).stat().st_size for name in ['history.json', 'history.csv']) <= S.HISTORY_LIMIT
    S.store(tmp_path / 'later', {'sha': 'd' * 40, 'status': 'measured'}, out / 'history.json')
    assert json.loads((tmp_path / 'later/history.json').read_text())[-1]['sha'] == 'd' * 40
