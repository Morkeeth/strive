# Capture a Cursor run from your own project

Agent Grinder reads Cursor sessions already on your computer. Your project remains the Cursor
workspace; do not clone Agentic Strava as the project you are trying to capture. Capture is local
and keyless. The hosted page receives only allowlisted card metrics in the URL fragment.

## Set up once on this computer

Keep the capture tool outside your own project:

```sh
git clone https://github.com/Morkeeth/strive.git ~/.agentgrinder/strive
python3 -m venv ~/.agentgrinder/venv
# macOS system Python 3.9 ships pip 21.2, which cannot do an editable install of this project.
~/.agentgrinder/venv/bin/pip install -U pip
~/.agentgrinder/venv/bin/pip install -e ~/.agentgrinder/strive
```

To make the local MCP tools available in one of your projects, run this once for that project:

```sh
cd /path/to/your-own-project
~/.agentgrinder/venv/bin/agentgrinder connect cursor --install
```

The command adds a machine-local `.cursor/mcp.json` and excludes an untracked config from that
repository. It refuses to replace a tracked or conflicting config. Reload Cursor, enable
**agentgrinder** under **Customize**, then ask:

```text
Use the agentgrinder a2a_onboard tool. Summarize the local-only capture and human approval rules. Do not publish anything.
```

MCP setup is optional for the command-line capture below. Neither setup adds credentials.

## Select the session before opening a preview

After working in your own project, stay in that project’s terminal and inspect the candidate:

```sh
cd /path/to/your-own-project
~/.agentgrinder/venv/bin/agentgrinder grind --harness cursor --list --show-paths
```

The receipt names the selected project and source transcript, then lists its sittings. Confirm
that the project is yours and choose the intended `sitting` number. If the newest transcript is
from another workspace, stop and pass the explicitly selected Cursor JSONL path as the first
argument:

```sh
~/.agentgrinder/venv/bin/agentgrinder grind \
  /exact/path/to/selected-cursor-session.jsonl \
  --harness cursor --list
```

Now open that exact sitting as a private preview on the live app:

```sh
AGENTGRINDER_URL=https://striverun.app \
~/.agentgrinder/venv/bin/agentgrinder grind \
  /exact/path/to/selected-cursor-session.jsonl \
  --harness cursor --pick 1 --push
```

Replace `1` with the sitting you selected; `--list` numbers them from 1, and `--pick -1` takes the
latest. `--push` is a historical flag name: it builds and
prints a metrics-only `#import` URL, and opens it only with `--open`. It does not upload or save the run. Imports at 1,500 bytes or
more use gzip inside the private fragment. The hosted page expands that payload before applying
the same run validator. Smaller imports keep the original encoding, so existing links remain
readable. The terminal prints the selected harness, project, source filename and sitting again, then
prints the hosted preview URL (`preview -> https://…#import=…`). Copy that URL into a browser, or
add `--open` to have the command open it.

The long-hash failure hypothesis is not confirmed here. Chromium documents a 2 MB URL limit and
a separate 32 KB address-bar display limit in its
[URL display guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/security/url_display_guidelines/url_display_guidelines.md).
The compressed path uses the browser's built-in `DecompressionStream`; MDN documents it as
[available across browsers since May 2023](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream/DecompressionStream).
If the page says the browser cannot expand the import, keep the generated `grind.html` as the
local file fallback for reviewing the selected card, update the browser, then rerun `--push`.
The local file does not save a hosted run.

The Grok Bot helper's `--handoff FILE` remains an explicit file fallback when a bot output channel
would copy, wrap or truncate the complete preview URL. Normal Cursor capture opens the compressed
hosted preview directly and does not require a handoff file.

On the hosted page, review the white card and blue trace. Missing measurements remain unknown.
Edit the suggested title and optional note or output link. The preview is not saved until you choose Save.
The audience defaults to Only me. Saving needs an account: while you are signed out the button reads
**Sign in to save**, and pressing it starts sign-in with GitHub. Signed in, pick
one audience on purpose:

- **Only me**: just you.
- **Close friends**: people on your private list.
- **Followers**: signed-in followers and close friends. It is not open to anyone who holds the URL.
- **Public**: the feed and your profile.

Then press **Save run**.

The equivalent explicit-origin command is:

```sh
~/.agentgrinder/venv/bin/agentgrinder grind \
  /exact/path/to/selected-cursor-session.jsonl \
  --harness cursor --pick 1 --push \
  --push-url https://striverun.app
```

The server can read only sessions on the computer where it runs. A Cloud Agent or Grok Bot cannot
infer sessions from your laptop.

Reference: [Cursor MCP documentation](https://prod.cursor.com/docs/mcp), checked 14 September 2026.

## Capture completed composers automatically

Run this once from the checkout:

```sh
python3 -m agentgrinder hook install --harness cursor
```

Cursor does not expose a documented local composer-complete hook. STRIVE therefore checks
Cursor's local `state.vscdb` on a timer. It installs a launchd agent on macOS, a systemd user timer
on Linux when a user service manager is available, or a private polling watcher. The watcher is
the fallback because it keeps the desktop session needed to open the loopback card.

The install records all composers already complete and ignores them. A future completed composer
is captured once by composer id into `~/.agentgrinder/hook`, then its card is served from
`http://127.0.0.1:8765` and the link is written to `~/.agentgrinder/hook/hook.log`. No browser
window opens unless the hook was installed with `hook install --harness cursor --open`. The card
itself loads no fonts or pictures from the network: the builder's face is an initial. The reader uses only allowlisted counts, timestamps and worker structure
from Cursor's database. Message text, tool arguments and paths do not enter the automatic card.
There are no credentials and no external requests.

### Where Cursor records a session, and why there are two places

Cursor stopped writing agent sessions into the single global `state.vscdb`. Each session now gets
its own SQLite file at `~/.cursor/chats/<workspace-hash>/<composer-id>/store.db`, with a
`meta.json` beside it holding `createdAtMs`, `updatedAtMs` and `cwd`.

Measured on this author's Mac on 16 September 2026, over 362 transcript composer ids:

| store | sessions held | of the newest 100 | transcripts dated |
| --- | --- | --- | --- |
| `globalStorage/state.vscdb` | 46 | 0 | 2026-02-24 to 2026-08-16 |
| `~/.cursor/chats/*/*/store.db` | 316 | 100 | 2026-08-10 to today |

The two sets do not overlap at all, so the move happened around the middle of August 2026. The
global store's newest COMPOSER row is 14 September, but no transcript matches it, so that row is
not an agent session and 14 September is not the cutover. Cursor's update record says version
3.20.17 was confirmed at 2026-09-14T08:08:31Z; any link between that version and this move is
unverified and the dates do not support it.

A capture that reads only the global store
is therefore blind to everything a user did this week. `agentgrinder/cursor_chats.py` reads the new
store, `agentgrinder/cursor_tree.py` still reads the old one, and `parse_cursor_session` tries the
new store, then the old store, then call order. `run["ridge_source"]` names which one answered, so
a card never implies a clock it did not read. Set `AGENTGRINDER_CURSOR_CHATS` to point the reader
at another chats folder.

Worker structure moved too. It is not in the protobuf step records. The hex-encoded JSON at
`meta['0']` in each worker's own store carries `subagentInfo.parentAgentId`; sibling fields name the
root parent and Cursor's worker type. The reader matches direct children to their parent and bins
each child's first-to-last tool request window on the same clock as the ridge. Only the activity
window leaves the reader. Worker ids, types, messages and tool arguments do not enter the card.

```sh
python3 -m agentgrinder hook status
python3 -m agentgrinder hook uninstall
```

Uninstalling stops the timer and loopback preview server. Existing private captures are kept.
