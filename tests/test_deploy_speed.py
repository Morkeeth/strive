"""Missing paint and wrong deployed objects must fail, without losing history."""
import importlib.util
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
    monkeypatch.setattr(S.urllib.request, 'urlopen', lambda *a, **k: io.BytesIO(json.dumps({'git_sha':'a'*40}).encode()))
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
