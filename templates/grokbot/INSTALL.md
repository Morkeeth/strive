# STRIVE Grok Bot companion kit

Update the existing STRIVE companion with this local kit. Do not create another bot or reinstall from an old branch. The kit contains `post-agent-run` and `manage-strive`; each is a standalone skill folder. Python 3 is the only runtime dependency for capture. A marketplace manifest and a native Grok session-export API have not been verified.

## Install or update from the supplied folder

Copy `post-agent-run/` into the bot's skill directory, replacing that skill's previous scripts and instructions together. Keep its `samples/` directory. If the bot already has `manage-strive`, compare its instructions before replacing it; this update does not require a new management skill or a new account. Never put credentials or session exports into either skill folder.

Run from any directory:

```sh
python3 /absolute/path/to/post-agent-run/scripts/test_contract.py
python3 /absolute/path/to/post-agent-run/scripts/smoke_test.py
```

The contract checks are offline. The smoke test uses labelled sample data and loopback-only fake HTTP servers. It makes no hosted request. Its sample result is not a real saved run.

## Capture this bot's own current session

Tell the existing companion:

Use post-agent-run to prepare a private STRIVE preview of this current session. Find the current session's actual export through your environment's supported export or session-file feature. Verify its session identity and time range. Do not choose an unrelated newest file, infer a laptop path, or reconstruct messages from memory. If this environment does not expose an export, tell me exactly which access or export is missing. Use only the selected export, report its measured scope and unknowns, and prepare the full preview link in a local handoff file. Do not upload or publish.

A supported export is JSONL with top-level `role` and `message`, user content containing `<timestamp>` and `<user_query>`, and assistant `tool_use` blocks. The helper chooses the latest sitting in that exact file, separating sittings on a gap of more than 30 minutes between timestamped user queries. A whole day or a collection of worker sessions is not the same object. Use an export restricted to the intended sitting if the latest sitting is not the one wanted. The source remains on the bot's computer.

```sh
python3 /absolute/path/to/post-agent-run/scripts/preview.py \
  /exact/path/to/current-session-export.jsonl \
  --handoff /tmp/strive-preview-url.txt
```

Check the selected-file receipt, start, typed-turn count and tool-call count against that export. Open the complete handoff file through the bot's browser capability rather than reconstructing a printed hash. The helper makes no network request. The default destination is `https://striverun.app`; opening a preview is a later browser action.

## What the card can prove

The adapter reports bot activity. It carries a measured 50-bin turn-order tool ridge and zero additional-worker bins, not a wall-time trace. Typed-query timestamps establish the start and sitting boundary. They do not timestamp tool calls, so duration, active human time, completed commits and changed files remain unknown. The current application supports this ridge without waiting for an old pending change.

Preview and direct upload now use the same source-bound capture revision and schema version. Different exports with equal totals no longer collapse into one identity. This revision changes from the older metric-only adapter. If the same run was already saved by an old kit, inspect that saved run before using the new helper to avoid a historical duplicate. New repeated captures of the same selected records reuse the same revision; adding later records changes the captured object.

## Save privately only when authorized

Without an existing private-upload authorization and Connect token, review the preview and stop before **Save run**. Confirm the correct STRIVE account and domain. A bot installation, a token, or a request for a preview is not a public-post instruction.

For an explicitly authorized private upload, the owner supplies `STRIVE_AGENT_TOKEN` through the environment. Never print or copy it into a prompt, skill or handoff. First inspect the exact payload without sending:

```sh
python3 /absolute/path/to/post-agent-run/scripts/upload.py \
  /exact/path/to/current-session-export.jsonl --dry-run
```

Then, within the existing authorization, run the same command without `--dry-run`. Optional `--title` and `--caption` carry reviewed text. It uses `/api/agent/runs` and saves privately. The upload helper refuses labelled samples. Images are added through the saved run's photo flow; neither script uploads photos. Changes to audience and a message to Eric require their own authorization.

## Remaining real-use gate

The existing companion previously reported installation and a smoke pass, without a token or observed real run. That is not proof of this updated kit. Verify the installed bytes, have that same bot select its own real export, inspect the preview, save one authorized private run, read it back after reload, add a reviewed photo and description, and verify the intended audience. Record installed, real preview, saved, image attached and shared separately. No new bot or duplicate account is needed.
