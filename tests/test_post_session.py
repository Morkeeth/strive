import json
from pathlib import Path
from agentgrinder.post_session import render

def test_untrusted_labels_cannot_end_script_or_inject_html():
    label = "</script><img src=x onerror=alert(1)>"
    run = {"project":label,"capture_metadata":{"models":[label]},"tool_calls":0}
    groups = {label:{"sessions":1,"tool_calls":0}}
    page = render([run],groups,"https://striverun.app/#review")
    assert label not in page
    payload = page.split('id="session-data">')[1].split('</script>')[0]
    assert json.loads(payload)["runs"][0]["project"] == label
    assert "fetch(" not in page
    assert "localStorage" not in page

def test_portable_bundle_can_install_itself(tmp_path):
    import importlib.util
    import subprocess
    import sys
    spec=importlib.util.spec_from_file_location("installer",Path(__file__).parents[1]/"scripts/strive-plugin.py")
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    bundle=module.build(tmp_path/"bundle/strive")
    config=tmp_path/"cursor"
    subprocess.run([sys.executable,str(bundle/"scripts/strive-plugin.py"),"install","cursor","--config-dir",str(config)],check=True,capture_output=True)
    installed=config/"plugins/local/strive"
    assert (installed/"runtime/agentgrinder/assets/post-session.js").is_file()
    result=subprocess.run([sys.executable,str(installed/"scripts/strive.py"),"--state",str(tmp_path/"state"),"doctor"],check=True,capture_output=True,text=True)
    # The installed bundle is one release: its three manifests agree, its runtime files are
    # there, and its own doctor names that release. The number is read from the bundle, not
    # pinned here, so a release bump does not break this test; a bundle whose doctor reports a
    # different number than the package it was installed from does.
    manifests=[installed/"plugin.json",installed/".cursor-plugin/plugin.json",installed/".claude-plugin/plugin.json"]
    versions={json.loads(path.read_text())["version"] for path in manifests}
    assert len(versions)==1
    for runtime in ("runtime/agentgrinder/plugin.py","runtime/agentgrinder/post_session.py","scripts/strive.py","scripts/strive-plugin.py"):
        assert (installed/runtime).is_file(), runtime
    assert json.loads(result.stdout)["version"] == versions.pop()
