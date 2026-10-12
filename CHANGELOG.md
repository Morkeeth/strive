# Changelog

## Unreleased

- The `strive` CLI starts again on Python 3.9, 3.10 and 3.11; a 3.12-only f-string had broken every command there, including `strive sessions` and `strive mcp`.
- `strive sync --install` runs the installed `striverun` release instead of GitHub `main`, and the MCP install commands name the published release.
- The privacy control refuses credential-shaped text (private keys, cloud, GitHub, Slack, model-provider, Stripe, Google, JWT and STRIVE Connect tokens) wherever it guards output.
- Public runs are available as JSON at `/r/<id>.json`; `/robots.txt` and `/sitemap.xml` exist.
- The app page enforces a Content-Security-Policy, loads the Supabase SDK at a pinned version with Subresource Integrity, and refuses to be framed.
- Profiles no longer expose their Supabase Auth user id to readers (migration 042).
- Plugin `doctor` and MCP `initialize` report the real release.

## STRIVE plugin 0.3.4 and striverun 0.1.1 — 11 October 2026

- Removed automatic reads of GitHub CLI and Claude configuration files. The package previously opened credential files belonging to other tools to count MCPs or find a GitHub user name. It read only names and counts from them and sent none of those files or credentials. Capture no longer opens them.
- Removed automatic GitHub CLI lookups and the AWS credential probe. When repository ownership needs those checks, STRIVE now reports it as unknown.
- Removed the external Supabase key environment lookup from the public plugin. STRIVE's own optional Connect token remains in `~/.strive/token` with owner-only permissions for approved private saves.
