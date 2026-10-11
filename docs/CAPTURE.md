# Preview a session privately

Choose Claude Code, Codex or Cursor on **Add run**. Copy its command into Terminal on the computer where you worked. It opens a local picker with recent sessions and their first prompt. Pick a session, name the project, then choose a sitting. The next page opens your private STRIVE preview. Save is a separate choice; keep **Only me** selected for a private run.

The command requires Python 3.10+ and uv. Add run also offers the same pinned package through pipx if you do not use uv. The short `uvx striverun` command is not published yet. Use the versioned command displayed by your current STRIVE site.

## Editor plugin and MCP

The STRIVE Claude Code and Cursor plugins use the same capture code. They remain an option for repeated use. Their installation is on Add run under Import setup.

For a client that supports stdio MCP, run `strive mcp` from an installed STRIVE package (or use the same `uvx --from <pinned package> strive mcp` command). This entrypoint exposes only `list_sessions` and `preview_session`. It cannot send or publish. First list sessions, then ask `preview_session` for that opaque session choice's sittings. Supply a sitting number and a project name to prepare a private preview.

Other harnesses are not supported by this picker yet.

## Large files and limits

The local picker reads JSONL as records and hashes the unchanged original. It groups sittings at recorded gaps of 30 minutes. A sitting starts with a recorded human turn; no typed-turn claim is made for system or tool messages. Timestamps keep their UTC offset. The picker tells you which sitting was selected and how many were skipped.

Limits: 2 GiB original source, 16 MiB per record, 64 MiB selected sitting, and 250,000 dated Claude records. An oversized or changing source fails with a clear message. It is never silently truncated. Retry when the agent has stopped writing.

The website file fallback accepts native session files up to 64 MiB. For a larger source, use the local picker. If a measured preview is too large for a 64 KiB URL, the picker offers a private `.strive.json` file instead. Choose that file on Add run. Prepared files are limited to 1 MiB and checked against the supported fields.

## What travels

The picker runs on `127.0.0.1`, your own computer. First prompts and source paths stay there. The handoff contains measured facts and a source hash, not transcript text. It is carried in a URL fragment, which is not part of the browser's HTTP request. STRIVE decodes it in your browser. No run is saved online until you choose Save. A hash identifies captured bytes; it does not prove that a claim is true.

Model-price estimates retain their usage and price basis. Missing data stays unknown. Occupied clock-minute bins describe tool activity and are not elapsed time or human work time.

The local flow is verified on macOS. Windows and Linux desktop flows have not been verified.
