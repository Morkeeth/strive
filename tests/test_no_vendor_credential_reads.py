"""The capture path must not inspect another tool's credentials."""
import builtins
import os
from pathlib import Path

import pytest

from agentgrinder import identity, ingest, reach


def test_capture_identity_and_rig_never_open_vendor_credentials(tmp_path, monkeypatch):
    protected = tuple(str(tmp_path / name) for name in
                      (".config/gh", ".claude", ".codex", ".cursor"))
    protected_env = str(tmp_path / ".env")
    original_open = builtins.open
    original_path_open = Path.open
    original_os_open = os.open
    attempted = []

    def guard(path):
        value = os.fspath(path)
        if value == protected_env or value.startswith(protected_env + ".") or any(
                value == prefix or value.startswith(prefix + os.sep) for prefix in protected):
            attempted.append(value)
            raise AssertionError("capture opened a vendor credential path")

    def safe_open(path, *args, **kwargs):
        guard(path)
        return original_open(path, *args, **kwargs)

    def safe_path_open(path, *args, **kwargs):
        guard(path)
        return original_path_open(path, *args, **kwargs)

    def safe_os_open(path, *args, **kwargs):
        guard(path)
        return original_os_open(path, *args, **kwargs)

    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / ".config"))
    monkeypatch.delenv(identity.ENV_HANDLE, raising=False)
    monkeypatch.setattr(builtins, "open", safe_open)
    monkeypatch.setattr(Path, "open", safe_path_open)
    monkeypatch.setattr(os, "open", safe_os_open)

    with pytest.raises(AssertionError, match="vendor credential"):
        safe_open(tmp_path / ".config/gh/hosts.yml")
    attempted.clear()

    identity.resolve(root=str(tmp_path))
    reach.author_identities(str(tmp_path))
    ingest.detect_rig()
    assert not attempted
