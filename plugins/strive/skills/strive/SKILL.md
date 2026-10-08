---
name: strive
description: Capture selected real Claude Code, Cursor or Codex sessions across named projects, review STRIVE cards, then save privately only on request. Also manages local capture status and optional completion hooks.
disable-model-invocation: true
---

Use the bundled `scripts/strive.py` at the plugin root. Run it with Python 3.9+.
Resolve the root from this skill's location (`../../scripts/strive.py` relative to this folder).
Never download another runtime, install dependencies or read a credential file.

1. Run `python3 <plugin>/scripts/strive.py doctor`. This reports local configuration, not successful client loading or hosted connectivity.
2. Ask which named projects and sessions to include if the user's request does not already select them. Register each with `project "Name" /absolute/project/root`. Never sweep every project or silently infer a public name from a path.
3. Use `sessions --project "Name"` to list local candidates and `sittings --harness claude|cursor|codex --source /selected/transcript.jsonl` to list available portions, then `capture --project "Name" --harness claude|cursor|codex --source /selected/transcript.jsonl --sitting N`. Sitting numbers are one-based; -1 means latest. Do not silently use latest when the user selected an earlier sitting. Child transcripts are excluded; the parent owns that session. Unsupported records stay unsupported. Raw text and paths stay on this machine.
4. Run `review ID1 ID2 ...` with the explicit captured draft IDs. Open the returned local file. Report selected session and project counts. Tools are activity, not success; missing models or tokens remain unknown. The returned `preview_url` opens the existing STRIVE batch review; it sends no upload by itself. The person selects cards and presses Save run to save as Only me.
   The local review is the blue post-session card editor. Each project keeps its own caption and selected image. It exports the exact preview as a PNG in post, story or square format, without posting. Keep STRIVE blue. Use the owner’s goal/result words; never invent an achievement from tool counts. Select photos individually, never scan the camera roll. Image edits remain local and do not alter the private-save payload. Feedback belongs in the existing saved-run comments, with honest person/agent attribution. Exporting is not publishing.
5. If the user explicitly asks you to save privately and Connect is configured through the `STRIVE_AGENT_TOKEN` environment variable, run `save REVIEW --approve REVIEW`. The review ID binds the exact immutable metrics shown in step 4. Never paste, read aloud, or log the token. Report the server's stored audience and per-project results, including unknown outcomes. Retry the same review after a lost response; the saved request ID prevents duplicate posts. No public share API is exposed here. The person deliberately chooses audience in STRIVE.

Optional capture: only when asked, `project "Name" /project/root --hooks` enables the installed native completion hooks for that exact project. They queue a local transcript reference, never parse on the critical path or send data. `collect` captures queued latest sittings; review those explicit drafts normally. Running `project "Name" /project/root` again turns hooks off. Multi-root events matching several opted-in projects are refused because attribution is ambiguous. No background daemon or global config hook is installed.

`status` lists draft IDs and queue errors. `remove ID` removes a local draft, not a hosted run. Installation removal uses the installer and preserves capture history and other plugins. Do not claim installation is verified until the real client's plugin inventory and invocation confirm it.
