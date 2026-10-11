# Changelog

## STRIVE plugin 0.3.4 and striverun 0.1.1 — 11 October 2026

- Removed automatic reads of GitHub CLI and Claude configuration files. The package previously opened credential files belonging to other tools to count MCPs or find a GitHub user name. It read only names and counts from them and sent none of those files or credentials. Capture no longer opens them.
- Removed automatic GitHub CLI lookups and the AWS credential probe. When repository ownership needs those checks, STRIVE now reports it as unknown.
- Removed the external Supabase key environment lookup from the public plugin. STRIVE's own optional Connect token remains in `~/.strive/token` with owner-only permissions for approved private saves.
