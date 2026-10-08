# STRIVE for Cursor and Claude Code

Capture selected real coding sessions from named projects, see the cards together, and save them privately. Sharing stays a separate choice in STRIVE. Python 3.9+ is the only runtime requirement; capture needs no model API key.

From the repository checkout:

```sh
python3 scripts/strive-plugin.py install cursor
python3 scripts/strive-plugin.py install claude
```

The Cursor installer copies a self-contained native plugin to `~/.cursor/plugins/local/strive`. Reload Cursor and check Customize → Plugins. Local imports must be allowed; a marketplace install with the same name takes precedence. Claude installation uses the actual `claude plugin marketplace add` and `claude plugin install` commands against a private local marketplace. Restart Claude Code, then invoke `/strive:strive`. For a disposable installation, add `--config-dir /temporary/config` to either installer command.

Build a portable bundle without installing: `python3 scripts/strive-plugin.py build /new/bundle/strive`. It includes both native manifests and a full copy of the same Python capture runtime, with no symlinks or downloads. Both clients support a local `--plugin-dir /new/bundle/strive` for testing. There is no marketplace publication in this workflow.

From the installed bundle, use `python3 scripts/strive.py --help`. Start with `doctor`, register each named project, choose a source with `sessions --project NAME`, capture selected sittings, then `review` their draft IDs. The review lists exactly which sessions and projects count, shows measured models only, and exposes the exact metrics bytes. The existing STRIVE batch preview lets you select and save cards as Only me.

For a direct private save, configure a Connect token as the environment variable `STRIVE_AGENT_TOKEN`, then use `save REVIEW_ID --approve REVIEW_ID` after review. Approval is bound to immutable payloads. Network errors leave an unknown result; retry uses the same request ID. Existing runs retain and report their stored audience. Tokens, transcripts, filenames and source paths never go in the request. No share command is provided.

Completion hooks are inert until a project is registered with `--hooks`. They queue only local references, are bounded to three seconds, and never call the network. Run `collect` to parse queued sessions. Remove opt-in by registering that project again without `--hooks`. Cursor transcripts must be enabled. Child transcripts are excluded to avoid counting a parent and its workers as independent sessions.

Uninstall with `python3 scripts/strive-plugin.py uninstall cursor` or `uninstall claude`; use the same `--config-dir` if applicable. Capture data stays in `~/.local/state/strive` (override with `STRIVE_STATE_DIR` or `--state`). Other plugins and user hooks are preserved. Installing files is distinct from the client loading and invoking the plugin.

Formats checked against current official documentation:

- [Cursor plugin reference](https://cursor.com/docs/reference/plugins), [local plugin installation](https://cursor.com/docs/plugins), [completion hooks](https://cursor.com/docs/hooks).
- [Claude plugin manifests](https://code.claude.com/docs/en/plugins-reference), [hooks](https://code.claude.com/docs/en/hooks).
