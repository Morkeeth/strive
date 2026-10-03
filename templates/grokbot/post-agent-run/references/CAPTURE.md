# Own-session capture

This directory is a standalone Python 3 kit. Keep its scripts and samples together. Use the existing STRIVE companion; installing this skill does not require creating another bot.

## Obtain the actual session

For “capture this session,” use the current environment's supported `ReadTranscript` for this conversation first. Acquire the bounded source directly when that tool is available. Use an explicitly selected export only as a fallback. Do not guess a person's laptop path, select the newest unrelated file, reconstruct messages from memory, or turn a status summary into events.

### Current-conversation transcript tool

If this environment provides `ReadTranscript`, its no-ID call reads this conversation. Do not assume a session file already exists. Freeze the upper bound immediately before the capture request, using the tool's stable message positions. Read only that bounded requested sitting, not the entire account history. The observed interface returns newest-first pages, accepts `before=position` and at most 200 records per page, and its total grows as reads occur. Do not chase the growing total or include the capture conversation in its own result.

Preserve the observable records returned by the API exactly in a private local JSONL file, then order them chronologically using their original stable positions. Keep user, assistant and tool records and their original content blocks. If the tool exposes text rather than a downloadable file, write the returned records as data; there is no assumed shell pipe or export endpoint. Deduplicate by original record identity/position, verify boundaries, sequence and role counts, and keep a local capture receipt. Do not echo the transcript in chat or upload it.

Do not invent timestamps or wrap plain user text in fabricated `<timestamp>` or `<user_query>` tags. Use native mode for the exact observed role/message/content shape. Keep one private JSONL row per returned position:

```json
{"position":10,"record":{"role":"user","message":{"content":[{"type":"text","text":"Example only, not a real session"}]}}}
```

The API may return a redacted projection rather than the stored raw transcript. Do not claim to have recovered hidden text. Redaction of a tool input/result body is different from omission of a tool-use envelope: counts require complete roles, positions and tool-use block boundaries, not private prose. If block presence itself is hidden, no complete tool-request count is available. Do not request unredacted private bodies merely to measure activity.

The strict native helper requires actual session identity and exact native records. For the observed ReadTranscript interface that exposes only an agent ID and page headers, use the **observable projection mode** below. Never relabel an agent ID as a session ID.


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

## Observable redacted projection

Use `--format projection` when ReadTranscript preserves visible role and block envelopes but shortens text/input/result bodies and supplies no session ID. This captures the API's observable projection, not the stored raw transcript. It counts only observed tool-use envelopes. Hidden activity completeness is not certified, so the recorded count is a lower bound, even when every visible page is accounted for.

Write one JSONL object per actual returned page. Copy the inclusive range, reported total and actual record order from the response. Example shape only:

```json
{"start_position":0,"end_position":2,"total":195,"order":"oldest-first","records":[{"role":"user","blocks":[{"type":"text"}]},{"role":"assistant","blocks":[{"type":"tool_use","id":"actual-tool-id","name":"actual-tool-name"}]},{"role":"tool","blocks":[{"type":"tool_result","tool_use_id":"actual-tool-id"}]}]}
```

Omit all bodies, including text, input and result. Preserve every observable block boundary and its actual tool ID/name. A result name is optional. Do not summarize several blocks into one, invent IDs or discard a visible block. The helper permits only these envelope fields. If an unsupported block is visible, report its type instead of silently omitting it.

The number of records must equal the inclusive page range. Only then may the helper derive positions from the documented page sequence. `order` must reflect the actual response ordering, not an assumption. If a page says one range but its body exposes fewer records, retry a smaller bounded page; do not derive indices from a truncated list. Identical overlap is allowed; conflicting overlap or missing frozen positions fails. Page totals may grow but do not expand the selected window to chase them. Boundary pages can extend outside the window; the helper validates their whole range/count before selecting the frozen positions.

Bounds JSON must contain exactly:

```json
{"agent_id":"actual-agent-id","conversation":"current","start_position":0,"end_position":131,"source":"ReadTranscript","content":"redacted projection","completeness":"not certified"}
```

Use the actual agent ID and frozen positions, not these example values. The source hash binds that context and the selected observable records. With no session identity available, it does not certify uniqueness across distinct conversations on the same agent. Inspect the prior run before retrying and do not claim a complete stored-session identity.

```sh
python3 /absolute/path/to/post-agent-run/scripts/preview.py \
  /exact/path/to/observable-pages.jsonl --format projection \
  --bounds /exact/path/to/frozen-bounds.json --handoff /tmp/strive-preview-url.txt
```

The preview says “Observed bot activity” and records `trace_basis: "observed native events; timestamps unavailable"`. Cards and share images label the counts as observed minimums; the tool-call leaderboard excludes them. The private receipt states the source context, page headers and uncertainty. Human prompts, start, duration, workers and commits remain absent. No raw text is read by this mode or uploaded. A source with no observed tool requests cannot produce a supported trace.

For an authorized private save, use the same source, bounds and `--format projection` with `scripts/upload.py --dry-run`, inspect the payload, then remove `--dry-run` only within the owner's authorization. Editable titles and descriptions cannot remove the persisted observation basis. This mode requires a deployment that admits that basis; a rejection is a compatibility failure, not permission to relabel it as a complete capture.
