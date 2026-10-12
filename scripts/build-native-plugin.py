#!/usr/bin/env python3
"""Build the public native plugin download from source, without local state."""
import hashlib
import base64
import importlib.util
import json
from pathlib import Path
import re
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
# MCP configs persist in people's editors, so they name one published release, never "latest".
PACKAGE_SPEC = 'striverun==' + re.search(r'^version = "([^"]+)"', (ROOT/'pyproject.toml').read_text(), re.M).group(1)
MCP_CONFIG = {'command': 'uvx', 'args': ['--from', PACKAGE_SPEC, 'strive-mcp']}
MCP_ENCODED = base64.b64encode(json.dumps(MCP_CONFIG, separators=(',', ':')).encode()).decode()
MCP_INSTALL_LINK = 'cursor://anysphere.cursor-deeplink/mcp/install?name=strive&config=' + MCP_ENCODED
spec = importlib.util.spec_from_file_location('installer', ROOT/'scripts/strive-plugin.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
out = ROOT/'dist/plugins'
out.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='strive-public-plugin-') as folder:
    bundle = installer.build(Path(folder)/'strive')
    target = out/'strive.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(bundle.rglob('*')):
            if path.is_symlink():
                raise ValueError('Public plugin refuses symlinks.')
            if not path.is_file():
                continue
            relative = path.relative_to(bundle)
            listing_icon = relative == Path('.claude-plugin/icon.png') and path.stat().st_size <= 2_000_000
            listing_logo = relative == Path('assets/logo.svg') and path.stat().st_size <= 100_000
            if not listing_icon and not listing_logo and path.name != 'LICENSE' and path.suffix not in ('.py','.js','.json','.md'):
                raise ValueError('Unexpected file in public plugin: '+str(path.relative_to(bundle)))
            info = zipfile.ZipInfo(str(path.relative_to(bundle.parent)), (2026,10,8,0,0,0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info,path.read_bytes())
    sha = hashlib.sha256(target.read_bytes()).hexdigest()
    immutable = out/(sha+'.zip')
    shutil.copyfile(target,immutable)
    manifest = json.loads((bundle/'.claude-plugin/plugin.json').read_text())
    (out/'release.json').write_text(json.dumps({'name':'strive','version':manifest['version'],
        'package':'/plugins/'+sha+'.zip','sha256':sha,'editors':['cursor','claude','codex'],
        'install':'/plugins/install.md'},indent=2)+'\n')
    (out/'install.md').write_text(('''# Install STRIVE

[Open the visual install page](https://striverun.app/install).

The session-end hook records nothing until you register a project. Nothing
leaves this machine until you press **Save run** in STRIVE or explicitly approve
a direct private save.

STRIVE captures selected real agent sessions and opens a local card for review.
Python 3.9+ is required to capture. No model API key is needed.

## Claude Code

For the two local preview tools, add the MCP server with one command:

```sh
claude mcp add strive -- uvx --from __STRIVE_MCP_SPEC__ strive-mcp
```

For the `strive` skill and optional capture hook, install the plugin, then
restart Claude Code:

```sh
claude plugin marketplace add Morkeeth/strive
claude plugin install strive@strive
```

Run `/strive:strive` and name the project and session you want to review.

## Cursor

[Add STRIVE's private preview tools to Cursor](%s) (new one-click link).
This installs a local MCP server with `list_sessions` and `preview_session` only.
It does not install the `strive` skill or completion hook. Cursor will ask you to
review the server before adding it. If the link does not open the install
dialog, add the same server to `~/.cursor/mcp.json`:

```json
{"mcpServers":{"strive":{"command":"uvx","args":["--from","__STRIVE_MCP_SPEC__","strive-mcp"]}}}
```

The local plugin and `strive` skill were verified in Cursor's Customize screen
and used to make a private preview. Python 3.9+ and `uvx` are required.

For the full STRIVE skill and optional local hook, use the local plugin route below.

Cursor's documented local plugin route loads a plugin from
`~/.cursor/plugins/local`. Clone the public source and copy the self-contained
plugin there:

```sh
git clone --depth 1 https://github.com/Morkeeth/strive.git strive-plugin-source
python3 strive-plugin-source/scripts/strive-plugin.py install cursor
```

Reload Cursor, open Customize → Plugins, and select STRIVE's `strive` skill.
Local plugin imports must be allowed. If another STRIVE marketplace plugin is
already installed, Cursor gives that one precedence.

## Codex

For the two local preview tools, add the MCP server with one command:

```sh
codex mcp add strive -- uvx --from __STRIVE_MCP_SPEC__ strive-mcp
```

For the `strive` skill, install the plugin, then start a new Codex session:

```sh
codex plugin marketplace add Morkeeth/strive
codex plugin add strive@strive
```

Invoke the `strive` skill in a new conversation.
The package contains the same local capture runtime. It does not install hooks
in Codex.

## ZIP fallback

If your editor cannot use the routes above, download the versioned archive in
`/plugins/release.json`, verify its SHA-256, and unzip it. From inside the
extracted `strive` folder, run `python3 scripts/strive-plugin.py install cursor`
or `python3 scripts/strive-plugin.py install claude`.

The installer refuses to overwrite an existing local package. To update it,
run the corresponding `uninstall` command first, then install again. Capture
history and other plugins remain untouched.

The blue local preview lets you add a caption and your selected photo, switch
projects, and download Post, Story or Square images. Downloads do not publish.
Review and save in STRIVE starts as Only me. Choose your audience separately.

Tell us what happened at https://striverun.app/?feedback: your editor, the action,
what you expected and what happened. Do not include tokens or raw transcripts.
''' % MCP_INSTALL_LINK).replace('__STRIVE_MCP_SPEC__', PACKAGE_SPEC))
print('Built STRIVE native plugin '+manifest['version']+' '+sha)

# The visual install page carries the same pinned server; dist/install.html is the copy build-site made.
page = ROOT/'dist/install.html'
html = page.read_text()
for token, value in (('__STRIVE_MCP_SPEC__', PACKAGE_SPEC), ('__STRIVE_MCP_INSTALL_LINK__', MCP_INSTALL_LINK.replace('&', '&amp;'))):
    if token not in html:
        raise ValueError(f'install.html lost its {token} marker')
    html = html.replace(token, value)
page.write_text(html)
