"""Every place that reports a STRIVE version reports the release it belongs to."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins/strive"


def _pyproject_version():
    return re.search(r'^version = "([^"]+)"', (ROOT / "pyproject.toml").read_text(), re.M).group(1)


def test_package_version_matches_pyproject():
    import agentgrinder
    assert agentgrinder.__version__ == _pyproject_version()


def test_mcp_server_reports_the_package_version():
    from agentgrinder import __version__
    from agentgrinder.mcp_server import _handle
    reply = _handle({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
    assert reply["result"]["serverInfo"]["version"] == __version__


def test_plugin_status_reports_the_manifest_version():
    from agentgrinder.plugin import VERSION
    for manifest in (PLUGIN / "plugin.json", PLUGIN / ".claude-plugin/plugin.json", PLUGIN / ".cursor-plugin/plugin.json"):
        assert json.loads(manifest.read_text())["version"] == VERSION, manifest
