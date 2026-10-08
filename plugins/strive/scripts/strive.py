#!/usr/bin/env python3
"""The installed bundle carries its runtime. Source checkout uses the same code."""
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
runtime = root/'runtime'
sys.path.insert(0, str(runtime if (runtime/'agentgrinder').is_dir() else root.parents[1]))
from agentgrinder.plugin import main
raise SystemExit(main())
