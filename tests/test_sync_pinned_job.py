"""The background sync job runs one published release, never an unpinned branch."""
import importlib
import importlib.metadata
import subprocess
import sys

import pytest


@pytest.fixture()
def sync(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("STRIVE_HOME", str(tmp_path / ".strive"))
    from agentgrinder import sync
    return importlib.reload(sync)


def _uvx_on_path(monkeypatch, sync):
    monkeypatch.setattr(sync.shutil, "which", lambda name: "/opt/bin/uvx" if name == "uvx" else None)


def test_job_runs_the_installed_release_through_uvx(sync, monkeypatch):
    _uvx_on_path(monkeypatch, sync)
    monkeypatch.setattr(importlib.metadata, "version", lambda name: "1.2.3" if name == "striverun" else None)
    assert sync._command() == ["/opt/bin/uvx", "--from", "striverun==1.2.3", "agentgrinder", "sync"]


def test_job_without_release_metadata_reuses_this_interpreter(sync, monkeypatch):
    _uvx_on_path(monkeypatch, sync)

    def missing(name):
        raise importlib.metadata.PackageNotFoundError(name)

    monkeypatch.setattr(importlib.metadata, "version", missing)
    assert sync._command() == [sys.executable, "-m", "agentgrinder", "sync"]


def test_job_without_uvx_reuses_this_interpreter(sync, monkeypatch):
    monkeypatch.setattr(sync.shutil, "which", lambda name: None)
    monkeypatch.setattr(importlib.metadata, "version", lambda name: "1.2.3")
    assert sync._command() == [sys.executable, "-m", "agentgrinder", "sync"]


def test_installed_cron_line_is_pinned(sync, monkeypatch):
    _uvx_on_path(monkeypatch, sync)
    monkeypatch.setattr(importlib.metadata, "version", lambda name: "1.2.3")
    monkeypatch.setattr(sync.sys, "platform", "linux")
    calls = []

    def run(args, **kwargs):
        calls.append((args, kwargs))
        return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

    monkeypatch.setattr(sync.subprocess, "run", run)
    sync.install()
    written = next(kwargs["input"] for args, kwargs in calls if args == ["crontab", "-"])
    line = next(row for row in written.splitlines() if "# strive-sync" in row)
    assert "--from striverun==1.2.3 agentgrinder sync" in line
    assert "git+" not in line


def test_no_capture_module_installs_from_a_git_branch():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    for source in (root / "agentgrinder").rglob("*.py"):
        assert "git+https://" not in source.read_text(), source
