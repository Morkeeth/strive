#!/usr/bin/env python3
"""Build the public native plugin download from source, without local state."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
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
            if path.name != 'LICENSE' and path.suffix not in ('.py','.js','.json','.md'):
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
        'package':'/plugins/'+sha+'.zip','sha256':sha,'editors':['cursor','claude'],
        'install':'/plugins/install.md'},indent=2)+'\n')
    (out/'install.md').write_text('''# STRIVE for Cursor and Claude Code

Download the plugin linked in `/plugins/release.json`, check its SHA-256 and unzip it.
Open a terminal inside the extracted `strive` folder. Python 3.9 or newer is required.

Cursor:
```sh
python3 scripts/strive-plugin.py install cursor
```

Claude Code:
```sh
python3 scripts/strive-plugin.py install claude
```

Restart the editor, open STRIVE in its plugin list and invoke its `strive` skill
(Claude Code: `/strive:strive`). Ask it to preview selected real sessions from your
named projects. No API key is needed for capture.

Already installed? The installer refuses to overwrite a plugin. From this same
folder, run `python3 scripts/strive-plugin.py uninstall cursor` (or `claude`), then
the install command above. Capture history is preserved; other plugins are untouched.

The blue local preview lets you add a caption and your selected photo, switch
projects, and download Post, Story or Square images. Downloads do not publish.
Review and save in STRIVE starts as Only me. Choose your audience separately.

Tell us what happened at https://striverun.app/?feedback: your editor, the action,
what you expected and what happened. Do not include tokens or raw transcripts.
''')
print('Built STRIVE native plugin '+manifest['version']+' '+sha)
