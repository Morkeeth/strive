---
name: post-agent-run
description: Capture this Grok Bot's own current session or an explicitly selected Grok Bot JSONL export as a private STRIVE preview. Supports an authorized private save with a Connect token. Use for real session capture and run preparation, not invented activity or automatic public posting.
---

This directory is a standalone Python 3 kit. Keep its scripts and samples together. Use the existing STRIVE companion; installing this skill does not require creating another bot.

## Obtain the actual session

For “capture this session,” use the current environment's supported session export or session-file capability and verify the current session identity. This is permission to prepare that session locally. Do not guess a person's laptop path or select the newest unrelated file. If the environment has no export capability or no readable session file, state that exact gap and request the export. Do not reconstruct a transcript from memory or convert a status summary into fake events.

### Current-conversation transcript tool

If this environment provides `ReadTranscript`, its no-ID call reads this conversation. Do not assume a session file already exists. Freeze the upper bound immediately before the capture request, using the tool's stable message positions. Read only that bounded requested sitting, not the entire account history. The observed interface returns newest-first pages, accepts `before=position` and at most 200 records per page, and its total grows as reads occur. Do not chase the growing total or include the capture conversation in its own result.

Preserve returned records exactly in a private local JSONL file, then order them chronologically using their original stable positions. Keep user, assistant and tool records and their original content blocks. If the tool exposes text rather than a downloadable file, write the returned records as data; there is no assumed shell pipe or export endpoint. Deduplicate by original record identity/position, verify boundaries, sequence and role counts, and keep a local capture receipt. Do not echo the transcript in chat or upload it.

Do not invent timestamps or wrap plain user text in fabricated `<timestamp>` or `<user_query>` tags. Use native mode for the exact observed role/message/content shape. Keep one private JSONL row per returned position:

```json
{"position":10,"record":{"role":"user","message":{"content":[{"type":"text","text":"Example only, not a real session"}]}}}
```

`record` must be the unchanged returned object. `position` is its actual stable tool position, never a newly assigned sequence number. The example above illustrates transport only. A separate private bounds JSON contains `session_id` (actual conversation identity), `start_position` and `end_position` (inclusive integers). Freeze both bounds before the capture request. The helper sorts positions, deduplicates identical page overlap, and rejects missing positions, conflicting duplicates, malformed JSON and unsupported block types. If the tool uses sparse/unstable positions or hides records, stop and report that actual gap; do not fill it with invented rows.

Native mode accepts user/assistant/tool records with text, tool_use and tool_result blocks. It counts assistant tool_use requests, not successful results. It reports recorded user-role messages only in the private receipt; these are not verified human-typed turns and never populate public prompts. The public ridge places tool requests across recorded message order, with no timing claim. Start, duration, human-typed turns, commits and workers remain unknown. A selected window with no tool requests is refused because it has no supported activity trace. It does not infer a sitting boundary without timestamps.

The older tagged export mode remains available as the default: top-level role/message with actual `<timestamp>` and `<user_query>` in user text, and assistant tool_use blocks. That mode selects the latest sitting separated by timestamped-query gaps. Use it only when the source truly contains those tags, never to retrofit native records.

## Prepare privately

After installation or update, run:

```sh
python3 /absolute/path/to/post-agent-run/scripts/test_contract.py
python3 /absolute/path/to/post-agent-run/scripts/test_native.py
python3 /absolute/path/to/post-agent-run/scripts/smoke_test.py
```

These exercise labelled synthetic data only. The smoke test includes loopback fake servers, with no hosted calls. For the native selected source, run:

```sh
python3 /absolute/path/to/post-agent-run/scripts/preview.py \
  /exact/path/to/current-session-export.jsonl --format native \
  --bounds /exact/path/to/frozen-bounds.json --handoff /tmp/strive-preview-url.txt
```

The helper makes no network request and writes the full `https://striverun.app/#import` URL. Confirm `selected_export`, the frozen positions and measured counts. Native start time remains unknown. Pass the handoff file to the browser, not a truncated chat hash. Raw prompts, replies, tool inputs/results and paths are absent from the import; the selected-source hash binds its identity without sending those records. The local selected-file receipt itself contains a path and stays private.

Report bot activity. Both modes use a turn-order ridge. Native mode uses recorded message order and `trace_basis: "timestamps unavailable"`; tagged mode uses timestamped query order. Native mode omits worker counts, prompts and start entirely. Neither measures elapsed tool timing. Never fill missing measurements.

Preview and upload share one capture revision. The same selected records reuse it, but an expanded session is a different capture. This replaces an older metric-only revision; inspect any prior saved run before uploading the same historical source through the updated kit.

## Save and add context

Draft a short title and description from verified outcomes or owner-provided text. Do not quote private prompts, invent success, or treat tool counts as work quality. Review the card, correct signed-in account, domain and audience. A preview request does not authorize saving or publishing.

If the owner already authorized automatic private uploads and supplied a Connect token through `STRIVE_AGENT_TOKEN`, inspect the exact payload first:

```sh
python3 /absolute/path/to/post-agent-run/scripts/upload.py \
  /exact/path/to/current-session-export.jsonl --format native \
  --bounds /exact/path/to/frozen-bounds.json --dry-run
```

Then run without `--dry-run` within that authorization. Optional `--title` and `--caption` accept reviewed text. Never print or persist the token. The helper refuses labelled samples and follows no redirect with the token. Repeating the same new-kit capture returns its existing run instead of duplicating it. Report the stored audience, including if an existing run's audience was changed by its owner later.

Without private-upload authorization or a token, show the preview and stop before **Save run**. Images use the saved run's Add photos flow, not this uploader. After an authorized save, verify the actual run, description and audience after reload. Do not change audience, post publicly, send a message, follow or reply without the applicable authorization. Distinguish installed, previewed, saved, image attached and shared.
