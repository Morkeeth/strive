# STRIVE for Cursor and Claude Code

Capture selected real coding sessions from named projects, see the cards together, and save them privately. Sharing stays a separate choice in STRIVE. Python 3.9+ is the only runtime requirement; capture needs no model API key.

## Your first private run

1. Install the plugin for your editor below and restart it.
2. In Claude Code, run `/strive:strive` and name the project and session you want. In Cursor, invoke the STRIVE skill and give it the same request. The skill checks the local source, captures the selected sitting and opens the card for your review.
3. Add your own result and project screenshot, then choose **Save run** with **Only me** in STRIVE. Saving needs a signed-in account. A Connect token is optional for a separately approved direct agent save; the token is never part of this first-run path.

The card preview is local until you save it. Check the selected source and measurements before the final step.

From the repository checkout or the extracted portable bundle:

```sh
python3 scripts/strive-plugin.py install cursor
python3 scripts/strive-plugin.py install claude
```

The Cursor installer copies a self-contained native plugin to `~/.cursor/plugins/local/strive`. Reload Cursor and check Customize → Plugins. Local imports must be allowed; a marketplace install with the same name takes precedence. Claude installation uses the actual `claude plugin marketplace add` and `claude plugin install` commands against a private local marketplace. Restart Claude Code, then invoke `/strive:strive`. For a disposable installation, add `--config-dir /temporary/config` to either installer command.

Cursor can also import Claude plugins automatically. The Claude-installed copy therefore has an explicit empty Cursor component map. Its imported entry is labelled “STRIVE for Claude Code (inactive in Cursor)” and contributes no second skill or hook; use the native STRIVE local entry in Cursor. The installer does not change your third-party import setting or disable other plugins.

Build a portable bundle without installing: `python3 scripts/strive-plugin.py build /new/bundle/strive`. It includes both native manifests and a full copy of the same Python capture runtime, with no symlinks or downloads. Both clients support a local `--plugin-dir /new/bundle/strive` for testing. There is no marketplace publication in this workflow.

From the installed bundle, use `python3 scripts/strive.py --help`. Start with `doctor`, register each named project, choose a source with `sessions --project NAME`, capture selected sittings, then `review` their draft IDs. The review lists exactly which sessions and projects count, shows measured models only, and exposes the exact metrics bytes. The existing STRIVE batch preview lets you select and save cards as Only me.

For a direct private save, configure a Connect token as the environment variable `STRIVE_AGENT_TOKEN`, then use `save REVIEW_ID --approve REVIEW_ID` after review. Approval is bound to immutable payloads. Network errors leave an unknown result; retry uses the same request ID. Existing runs retain and report their stored audience. Tokens, transcripts and absolute source paths never go in the request. Repository-relative file names leave the machine only with the separate Code Route opt-in below. No share command is provided.

Completion hooks are inert until a project is registered with `--hooks`. They queue only local references, are bounded to three seconds, and never call the network. Run `collect` to parse queued sessions. Remove opt-in by registering that project again without `--hooks`. Cursor transcripts must be enabled. Child transcripts are excluded to avoid counting a parent and its workers as independent sessions.

## Record a new Code Route

Version 0.3.1 can record checkpoints for work that starts after your consent. Register the project first, then select its exact native transcript:

```sh
python3 scripts/strive.py route-start --project "My project" --harness codex --source /path/to/session.jsonl --consent
python3 scripts/strive.py route-checkpoint CAPTURE_ID
python3 scripts/strive.py route-review CAPTURE_ID
```

Run a checkpoint after an edit, and another after a commit. Repeat `--project` at the start to select several repositories. The collector measures tracked-file fingerprints and newly reachable Git commits. Its axis is observation order, not guessed action time. A snapshot that sees edits and commits together produces one commit checkpoint. Newly tracked files without a previous fingerprint establish a baseline; they are not counted as earlier edits.

Optional landmarks need separate consent at the start. Add `--share-commit-subjects` to include safe, exact Git subjects, and `--share-file-names` for safe repository-relative changed names (at most 20 per checkpoint). Omitted or sensitive descriptions remain absent; no generated outcome replaces them. The complete observed file count remains separate from the bounded list of names. Each checkpoint supports at most five newly observed commits.

To allow source links for a known public repository, add `--public-repo "My project=https://github.com/OWNER/REPO"`. The URL must match that project's Git origin. On a checkpoint, STRIVE makes unauthenticated requests to GitHub for this explicitly selected repository only; an exact public commit response is required before a link appears. An unpushed commit keeps its local hash without a link. No credential, private remote or transcript is sent. A later review never fetches or enriches old captures. Two worktrees of one repository cannot be presented as different projects.

The native source is anchored at its current byte boundary. Only later records count toward this run. An explicitly selected delegated transcript can be used for this bounded window; do not combine it with its parent. Missing model names and window-scoped token totals remain unknown. No old run is changed.

`route-review` freezes the local source witness, metrics and Code Route, then creates the normal private review. It returns the importable run JSON, preview link and source digest. No upload occurs. Use `save REVIEW_ID --approve REVIEW_ID` only after reviewing and explicitly choosing to save privately. Repeating review returns the same bytes; later work needs a new consented capture. `route-status` lists open and closed captures.

From a source checkout, use `python3 -m agentgrinder.plugin` in place of `python3 scripts/strive.py`, or use `python3 -m agentgrinder code-route start|checkpoint|review|status`. Completion hooks do not start Code Route capture or infer checkpoints.

Uninstall with `python3 scripts/strive-plugin.py uninstall cursor` or `uninstall claude`; use the same `--config-dir` if applicable. Capture data stays in `~/.local/state/strive` (override with `STRIVE_STATE_DIR` or `--state`). Other plugins and user hooks are preserved. Installing files is distinct from the client loading and invoking the plugin.

Formats checked against current official documentation:

- [Cursor plugin reference](https://cursor.com/docs/reference/plugins), [local plugin installation](https://cursor.com/docs/plugins), [completion hooks](https://cursor.com/docs/hooks).
- [Claude plugin manifests](https://code.claude.com/docs/en/plugins-reference), [hooks](https://code.claude.com/docs/en/hooks).

## After a session

`review` opens a local card editor with STRIVE blue, measured stats and project arrows. Add your caption and a photo or screenshot, choose Post (1080 × 1350), Story (1080 × 1920) or Square, then download the exact preview as a PNG. Photos and captions stay per project in this open editor; reloading discards these edits. The default shows the entire image; crop is an explicit choice. Token and model rows can be hidden.

The share ring uses complete tool-call measurements only and names its denominator. Missing measurements stay unknown. Cached input is not added twice. With several sessions, the trace shows the first selected session and says so; it never joins different clocks. Goals/results are the owner’s words, not generated claims. The selected date range is on the image.

Card edits and downloads do not save, upload or publish anything. Review and save in STRIVE opens the existing private-save path. People and their agents use the existing comments on saved runs.
