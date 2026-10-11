"""The shipped site palette and product name, embedded in standalone cards for offline use.

`server/brand.mjs` holds the same two strings for the site. The local cards are rendered by
Python with no access to that module, so the name lives here as well and `tests/test_brand.py`
binds the two copies together. Internal identifiers, the package name, the CLI command and the
`strava` schema are deliberately not derived from it.
"""

BRAND = "STRIVE"
TAGLINE = "Post your strides"

CARD_THEME = ':root{\n  --paper:#f7f7f5;--box:#fff;--ink:#0a0a0a;--soft:#6f6f6b;--dim:#73736f;\n  --rule:#e3e3df;--rule-2:#efefec;--blue:#0047ff;--blue-soft:#c4d2ff;--blue-wash:#f2f5ff;\n  /* the old token names, aliased, so no inline style left in this file can bring the green back */\n  --bg:var(--paper);--card:var(--box);--line:var(--rule);--muted:var(--soft);\n  --accent:var(--blue);--accent-ink:var(--blue);--accent-soft:var(--blue-wash);\n}\n:root{--faint:var(--dim);--grid:var(--rule-2);--ship:var(--ink);--disp:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Sans",system-ui,sans-serif}\n@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#101112;--box:#191a1c;--ink:#f5f5f2;--soft:#b2b2ad;--dim:#aaaaa5;--rule:#393a3c;--rule-2:#252628;--blue:#8aaaff;--blue-wash:#182342}}\n:root[data-theme="dark"]{--paper:#101112;--box:#191a1c;--ink:#f5f5f2;--soft:#b2b2ad;--dim:#aaaaa5;--rule:#393a3c;--rule-2:#252628;--blue:#8aaaff;--blue-wash:#182342}\n'
