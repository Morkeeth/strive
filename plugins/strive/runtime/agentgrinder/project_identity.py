"""Private project identity: linked worktrees share a Git directory, names do not."""
import hashlib
from pathlib import Path
import subprocess


def identity(path):
    if not path:return None
    root=Path(path).expanduser().resolve()
    if root.is_file():root=root.parent
    try:
        result=subprocess.run(['git','-C',str(root),'rev-parse','--git-common-dir'],capture_output=True,text=True,timeout=5)
        if result.returncode==0:
            common=Path(result.stdout.strip())
            root=(common if common.is_absolute() else root/common).resolve()
    except (OSError,subprocess.TimeoutExpired):
        pass
    return hashlib.sha256(str(root).encode()).hexdigest()
