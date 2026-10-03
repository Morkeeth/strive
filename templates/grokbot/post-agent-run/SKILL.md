---
name: post-agent-run
description: Capture this Grok Bot's own current session or an explicitly selected Grok Bot JSONL export as a private STRIVE preview. Supports an authorized private save with a Connect token. Use for real session capture and run preparation, not invented activity or automatic public posting.
---

This directory is a standalone Python 3 kit. Keep its scripts and samples together. Use the existing STRIVE companion; installing this skill does not require creating another bot.

## Obtain the actual session

For “capture this session,” use the current environment's supported session export or session-file capability and verify the current session identity. This is permission to prepare that session locally. Do not guess a person's laptop path or select the newest unrelated file. If the environment has no export capability or no readable session file, state that exact gap and request the export. Do not reconstruct a transcript from memory or convert a status summary into fake events.

The supported JSONL format has top-level `role` and `message`; user text contains `<timestamp>` and `<user_query>`; assistant content contains `tool_use` blocks. Select the actual export on this bot's computer. The helper uses its latest sitting, split on timestamped-query gaps greater than 30 minutes. Check that this is the requested sitting. It does not combine a whole day, other bots or worker logs. Freeze/export the requested window before capture so later conversation does not change its identity.

## Prepare privately

After installation or update, run:

```sh
python3 /absolute/path/to/post-agent-run/scripts/test_contract.py
python3 /absolute/path/to/post-agent-run/scripts/smoke_test.py
```

These exercise labelled synthetic data only. The smoke test includes loopback fake servers, with no hosted calls. Then capture the selected real source:

```sh
python3 /absolute/path/to/post-agent-run/scripts/preview.py \
  /exact/path/to/current-session-export.jsonl \
  --handoff /tmp/strive-preview-url.txt
```

The helper makes no network request and writes the full `https://striverun.app/#import` URL. Confirm `selected_export`, the selected start and measured counts. Pass the handoff file to the browser, not a truncated chat hash. Raw prompts, replies, tool inputs/results and paths are absent from the import; the selected-source hash binds its identity without sending those records. The local selected-file receipt itself contains a path and stays private.

Report bot activity. The ridge has 50 turn-order bins, tool calls placed by the timestamped query they followed, and `ridge_basis: "turn-order"`. `worker_bins` contains zero additional workers because the adapter does not count worker activity. Timestamps establish query start and sitting boundaries, not tool-event timing. Duration, active human work, changed files and successful commits remain unknown. Never fill missing measurements.

Preview and upload share one capture revision. The same selected records reuse it, but an expanded session is a different capture. This replaces an older metric-only revision; inspect any prior saved run before uploading the same historical source through the updated kit.

## Save and add context

Draft a short title and description from verified outcomes or owner-provided text. Do not quote private prompts, invent success, or treat tool counts as work quality. Review the card, correct signed-in account, domain and audience. A preview request does not authorize saving or publishing.

If the owner already authorized automatic private uploads and supplied a Connect token through `STRIVE_AGENT_TOKEN`, inspect the exact payload first:

```sh
python3 /absolute/path/to/post-agent-run/scripts/upload.py \
  /exact/path/to/current-session-export.jsonl --dry-run
```

Then run without `--dry-run` within that authorization. Optional `--title` and `--caption` accept reviewed text. Never print or persist the token. The helper refuses labelled samples and follows no redirect with the token. Repeating the same new-kit capture returns its existing run instead of duplicating it. Report the stored audience, including if an existing run's audience was changed by its owner later.

Without private-upload authorization or a token, show the preview and stop before **Save run**. Images use the saved run's Add photos flow, not this uploader. After an authorized save, verify the actual run, description and audience after reload. Do not change audience, post publicly, send a message, follow or reply without the applicable authorization. Distinguish installed, previewed, saved, image attached and shared.
