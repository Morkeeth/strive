import pytest
from agentgrinder.contract import validate_run
from agentgrinder.push import export_run


def test_legacy_runs_remain_readable_without_inventing_missing_counts():
    exported = export_run({"turns_typed": 3})
    assert exported["schema_version"] == 1
    assert "claims_verified" not in exported


@pytest.mark.parametrize("worker_bins", [[1] * 49, [0] * 49 + [-1], "corrupt"])
def test_ridge_rejects_invalid_worker_bins(worker_bins):
    run = {
        "ridge": [0] * 50,
        "ridge_basis": "wall-time",
        "worker_bins": worker_bins,
    }

    with pytest.raises(ValueError, match="worker_bins"):
        validate_run(run)


def test_ridge_preserves_valid_worker_bins():
    worker_bins = [index % 3 for index in range(50)]
    run = {
        "ridge": [0] * 50,
        "ridge_basis": "wall-time",
        "worker_bins": worker_bins,
    }

    assert validate_run(run)["worker_bins"] == worker_bins


@pytest.mark.parametrize("run", [{"schema_version": 2}, {"claims": True},
                                 {"commits": -1}, {"claims": 1, "claims_verified": 2},
                                 {"claims_verified": 1}, {"claims": None, "claims_verified": 0},
                                 {"duration_s": float("nan")}])
def test_bad_imports_are_rejected(run):
    with pytest.raises(ValueError):
        validate_run(run)


def test_only_revision_references_leave_local_measurement():
    exported = export_run({"turns_typed": 2, "measurement": {
        "revision_id": "a" * 64, "baseline_revision_id": "b" * 64,
        "command": "private-command", "input_digest": "private-digest", "project": "/private/repo"}})
    assert exported["measurement_revision"] == "a" * 64
    assert exported["baseline_revision"] == "b" * 64
    assert "private" not in str(exported)


def test_reexport_preserves_frozen_references():
    from agentgrinder.push import export_run
    original={'schema_version':1,'turns_typed':2,'measurement_revision':'a'*64,'baseline_revision':'b'*64}
    assert export_run(original)['measurement_revision']==original['measurement_revision']
    assert export_run(original)['baseline_revision']==original['baseline_revision']


def test_claude_grind_exports_measured_trace_basis_and_revision(tmp_path):
    """Exercise the front door with a real capture, not a hand-authored export row."""
    import json
    import os
    from pathlib import Path
    import subprocess
    import sys
    root = Path(__file__).resolve().parents[1]
    env = {**os.environ, 'AGENTGRINDER_SERIES': str(tmp_path / 'series.db')}
    result = subprocess.run(
        [sys.executable, '-m', 'agentgrinder', 'grind', 'samples/sample_session.jsonl',
         '--harness', 'claude', '--no-rank', '--json'],
        cwd=root, env=env, check=True, capture_output=True, text=True,
    )
    run = json.loads(result.stdout)
    exported = export_run(run)
    assert exported['trace_basis'] == 'elapsed-agent-tool-calls'
    assert len(exported['measurement_revision']) == 64
    # The sample contains four tool requests at 20, 60, 320 and 360 seconds.
    # The reader divides its 610-second sitting into 90 elapsed-time buckets.
    assert [i for i, n in enumerate(exported['rhythm']) if n] == [2, 8, 47, 53]
    assert sum(exported['rhythm']) == exported['tool_calls'] == 4


def test_unknown_worker_bins_stay_unknown():
    run = {"ridge": [0] * 50, "ridge_basis": "wall-time", "worker_bins": None}
    assert validate_run(run)["worker_bins"] is None
