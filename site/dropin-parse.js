/* THE DROP-IN READER. A session file dropped on the landing page is read here, in the browser,
   and nothing in this file sends anything anywhere. It is a port of the three Python readers in
   agentgrinder/ingest.py (parse_session, parse_cursor_session, parse_codex_session with
   native_trace.codex_activity), limited to the numbers the card draws:

     turns typed, tool calls, files changed, commits, wall time, start, activity line, and the
     route through folders as station indices (folderRoute below).

   scripts/test-dropin-parity.mjs runs both readers over the same files and fails on any
   difference. If you change a rule here, change it in ingest.py too, or the test goes red.

   PRIVACY. Prompt text, file paths, commands and code are read only to be counted and are never
   kept: the result holds numbers, one ISO start time and the harness name. There is no title
   here on purpose. Python titles a run with the first prompt; that is prompt text, so a drop-in
   title is typed by the person. */
(function (root) {
  "use strict";

  const HARNESSES = ["Claude Code", "Cursor", "Codex"];

  // Python's datetime keeps microseconds; Date keeps milliseconds. Seconds are parsed here as a
  // float with the full fraction so the wall time rounds the same way int() does in Python.
  function seconds(iso) {
    if (typeof iso !== "string") return null;
    const m = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(iso.trim());
    if (!m) return null;
    if (!m[3]) return null; // a naive time has no zone; Python cannot compare it either
    const zone = m[3] === "Z" ? "Z" : m[3].length === 5 ? m[3].slice(0, 3) + ":" + m[3].slice(3) : m[3];
    const base = Date.parse(m[1].replace(" ", "T") + zone);
    if (!Number.isFinite(base)) return null;
    return base / 1000 + (m[2] ? Number("0" + m[2]) : 0);
  }

  // agentgrinder/native_sittings.cursor_time: the <timestamp> tag Cursor writes into a typed turn.
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
  function cursorTime(text) {
    const tag = /<timestamp>([\s\S]*?)<\/timestamp>/.exec(text);
    if (!tag) return null;
    const value = tag[1].trim();
    const iso = seconds(value);
    if (iso != null) return iso;
    const off = /\(UTC(?:([+-]\d{1,2})(?::(\d{2}))?)?\)/.exec(value);
    if (!off) return null;
    const hours = parseInt(off[1] || "0", 10);
    const minutes = parseInt(off[2] || "0", 10) * ((off[1] || "").startsWith("-") ? -1 : 1);
    if (Math.abs(hours) > 23 || Math.abs(minutes) > 59) return null;
    const d = /^[A-Za-z]+, ([A-Za-z]+) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}) (AM|PM)$/.exec(value.slice(0, off.index).trim());
    if (!d) return null;
    const month = MONTHS[d[1].toLowerCase()];
    if (month == null) return null;
    let h = parseInt(d[4], 10) % 12;
    if (d[6] === "PM") h += 12;
    const utc = Date.UTC(+d[3], month, +d[2], h, +d[5]) - (hours * 60 + minutes) * 60000;
    return utc / 1000;
  }

  const blocks = (msg) => (msg && Array.isArray(msg.content) ? msg.content : []);
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  // THE ROUTE: the folders the run went through, as station indices. agentgrinder/ingest.py
  // folder_route is the same rule, and scripts/test-dropin-parity.mjs compares the two.
  //   station = the folder a touched file sits in (the path up to its last slash), numbered in
  //             the order the run first reached it, at most 16 stations;
  //   a move  = one file touch, with consecutive touches in one folder collapsed to one stay,
  //             at most 400 moves.
  // The folder is a key in this function and nowhere else: what leaves is the list of indices.
  const MAX_STATIONS = 16, MAX_MOVES = 400;
  function folderRoute(paths) {
    const stations = new Map();
    const out = [];
    for (const p of paths) {
      const key = String(p).slice(0, Math.max(0, String(p).lastIndexOf("/")));
      let i = stations.get(key);
      if (i === undefined) {
        if (stations.size >= MAX_STATIONS) continue;
        i = stations.size;
        stations.set(key, i);
      }
      if (out.length && out[out.length - 1] === i) continue;
      if (out.length >= MAX_MOVES) break;
      out.push(i);
    }
    return out;
  }

  // agentgrinder/authorship.is_human_turn, the one gate every typed-turn count goes through.
  function isHumanTurn(o) {
    if (o.type !== "user") return false;
    if (o.promptSource !== "typed" && o.promptSource !== "queued") return false;
    if (o.isMeta || o.isSidechain) return false;
    if (o.toolUseResult !== undefined && o.toolUseResult !== null) return false;
    if (blocks(o.message).some((b) => isObj(b) && b.type === "tool_result")) return false;
    return true;
  }

  function claudeReader() {
    const typed = [], all = [];
    let tools = 0, commits = 0;
    const files = new Set(), touched = [], toolsAt = [];
    return {
      harness: "Claude Code",
      add(o) {
        const t = seconds(o.timestamp);
        if (t != null) all.push(t);
        const msg = isObj(o.message) ? o.message : {};
        if (isHumanTurn(o)) {
          if (t != null) typed.push(t);
        } else if (o.type === "assistant") {
          for (const b of blocks(msg)) {
            if (!isObj(b) || b.type !== "tool_use") continue;
            tools += 1;
            if (t != null) toolsAt.push(t);
            const input = isObj(b.input) ? b.input : {};
            const name = b.name || "";
            const at = typeof input.file_path === "string" && input.file_path ? input.file_path : typeof input.notebook_path === "string" && input.notebook_path ? input.notebook_path : null;
            if (at) touched.push(at);
            if ((name === "Edit" || name === "Write" || name === "NotebookEdit") && input.file_path) files.add(String(input.file_path));
            else if (name === "Bash" && String(input.command || "").includes("git commit")) commits += 1;
          }
        }
      },
      done() {
        if (!typed.length) throw readError("no-turns");
        const t0 = Math.min(...typed);
        const ev = all.filter((t) => t >= t0).sort((a, b) => a - b);
        let span = 0;
        for (let i = 1; i < ev.length; i++) span += Math.min(ev[i] - ev[i - 1], 1200);
        let rhythm;
        if (span > 0) {
          rhythm = new Array(24).fill(0);
          for (const t of typed) rhythm[Math.min(23, Math.floor(((t - t0) / span) * 24))] += 1;
        } else rhythm = [typed.length];
        // THE LINE THE CARD DRAWS. `rhythm` is the Python rhythm (typed turns per bin, parity
        // tested) and a one-prompt night is a single spike on it. The file also stamps every tool
        // call, so the card draws those: tool calls per bin over the same moving time, a gap over
        // twenty minutes counted as twenty, the same clock `duration_s` is read from.
        let line;
        if (span > 0 && toolsAt.length) {
          const pos = new Map();
          let at = 0;
          ev.forEach((t, i) => { if (i) at += Math.min(t - ev[i - 1], 1200); if (!pos.has(t)) pos.set(t, at); });
          line = new Array(24).fill(0);
          for (const t of toolsAt) if (pos.has(t)) line[Math.min(23, Math.floor((pos.get(t) / span) * 24))] += 1;
        }
        return { turns_typed: typed.length, tool_calls: tools, files_touched: files.size, commits,
          duration_s: Math.trunc(span), started: t0, rhythm, route: folderRoute(touched),
          ...(line ? { line, line_basis: "tool calls per bin of moving time" } : {}) };
      },
    };
  }

  function cursorText(msg) {
    const c = msg && msg.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.filter((b) => isObj(b) && b.type === "text").map((b) => b.text || "").join(" ");
    return "";
  }

  function cursorReader() {
    let typed = 0, tools = 0, commits = 0;
    const files = new Set(), stamps = [], perTurn = [], touched = [];
    let edits = 0;
    return {
      harness: "Cursor",
      add(o) {
        const msg = isObj(o.message) ? o.message : {};
        if (o.role === "user") {
          const text = cursorText(msg);
          if (!text.includes("<user_query>")) return;
          typed += 1;
          perTurn.push(0);
          const t = /<timestamp>/.test(text) ? cursorTime(text) : null;
          if (t != null) stamps.push(t);
        } else if (o.role === "assistant") {
          for (const b of blocks(msg)) {
            if (isObj(b) && b.type != null && b.type !== "text") { tools += 1; if (perTurn.length) perTurn[perTurn.length - 1] += 1; }
            if (!isObj(b) || b.type !== "tool_use" || !isObj(b.input)) continue;
            if (typeof b.input.path === "string" && b.input.path) touched.push(b.input.path);
            if (b.name === "Write" || b.name === "StrReplace") {
              if (typeof b.input.path === "string" && b.input.path) { files.add(b.input.path); edits += 1; }
            } else if (b.name === "Shell" && String(b.input.command || "").includes("git commit")) commits += 1;
          }
        }
      },
      done() {
        if (!typed) throw readError("no-turns");
        const n = Math.min(24, Math.max(1, typed));
        const rhythm = new Array(n).fill(0);
        for (let i = 0; i < typed; i++) rhythm[Math.min(n - 1, Math.floor((i * n) / typed))] += 1;
        // Cursor's transcript stamps typed turns only, so it has no agent clock. The Python reader
        // refuses a wall time from it too (ingest.py, "Refuse elapsed rates here").
        // THE LINE THE CARD DRAWS. `rhythm` above is the Python rhythm (parity-tested), and for
        // Cursor it is flat by construction: typed turns bucketed by their own position. The file
        // does measure how much the agent did after each typed turn, so the card draws that:
        // tool calls per typed turn, in turn order, summed into at most 24 bins. Not elapsed time.
        const bins = Math.min(24, perTurn.length);
        const line = new Array(bins).fill(0);
        perTurn.forEach((v, i) => { line[Math.min(bins - 1, Math.floor((i * bins) / perTurn.length))] += v; });
        return { turns_typed: typed, tool_calls: tools, files_touched: files.size || null,
          commits: edits || commits ? commits : null, duration_s: null,
          started: stamps.length ? Math.min(...stamps) : null, rhythm, line, line_basis: "tool calls per typed turn, in turn order",
          route: folderRoute(touched) };
      },
    };
  }

  const CODEX_INJECTED = ["<recommended_plugins>", "<environment_context>", "<turn_aborted>", "# Files mentioned by the user:"];
  function codexCommand(blob) {
    if (typeof blob !== "string") return "";
    let parsed;
    try { parsed = JSON.parse(blob); } catch (_) { return blob; }
    if (isObj(parsed)) {
      const cmd = "cmd" in parsed ? parsed.cmd : parsed.command;
      if (Array.isArray(cmd)) return cmd.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
      if (typeof cmd === "string") return cmd;
    }
    return blob;
  }

  function codexReader() {
    let delegated = false, index = -1, commits = 0, edits = 0;
    // Typed turns come in two shapes (agentgrinder/native_trace.py says why): the CLI's
    // event_msg user_message, or the desktop app's response_item user message. The event form
    // wins when the file has it; `messages` is the fallback.
    const users = [], messages = [], events = [], calls = new Set(), files = new Set(), stamps = [], touched = [];
    return {
      harness: "Codex",
      add(o) {
        index += 1;
        const t = seconds(o.timestamp);
        if (typeof o.timestamp === "string" && t != null) stamps.push(t);
        const p = o.payload;
        if (!isObj(p)) return;
        if (o.type === "session_meta" && isObj(p.source) && "subagent" in p.source) delegated = true;
        let kind = null;
        if (o.type === "event_msg" && p.type === "user_message") {
          // Whether the session is delegated is only known once every session_meta is read,
          // so each user message is held as (time, injected) and classified at the end.
          const text = String(p.message || "").replace(/^\s+/, "");
          users.push({ t, injected: CODEX_INJECTED.some((m) => text.startsWith(m)) });
          return;
        } else if (o.type === "response_item" && p.type === "message" && p.role === "user") {
          const text = (Array.isArray(p.content) ? p.content.filter(isObj).map((c) => c.text || "").join("") : String(p.content || "")).replace(/^\s+/, "");
          messages.push({ t, injected: CODEX_INJECTED.some((m) => text.startsWith(m)) });
          return;
        } else if (p.type === "function_call" || p.type === "custom_tool_call") {
          const id = p.call_id || p.id || "record:" + index;
          if (!calls.has(id)) { calls.add(id); kind = "tool"; }
          if (p.type === "custom_tool_call" && p.name === "exec" && codexCommand(p.input).includes("git commit")) commits += 1;
        } else if (p.type === "patch_apply_end" && p.success === true) {
          kind = "edit";
          if (isObj(p.changes)) for (const k of Object.keys(p.changes)) if (k) { files.add(k); edits += 1; touched.push(k); }
        }
        if (kind && t != null) events.push(t);
      },
      done() {
        const typedIn = users.length ? users : messages;
        const human = delegated ? [] : typedIn.filter((u) => !u.injected);
        if (!human.length) throw readError(delegated ? "delegated" : "no-turns");
        const all = events.concat(human.filter((u) => u.t != null).map((u) => u.t)).sort((a, b) => a - b);
        const start = all.length ? all[0] : 0;
        const span = all.length ? Math.max(1, all[all.length - 1] - start) : 1;
        const rhythm = new Array(Math.min(24, Math.max(1, human.length))).fill(0);
        for (const u of human) if (u.t != null) rhythm[Math.min(rhythm.length - 1, Math.floor(((u.t - start) / span) * rhythm.length))] += 1;
        return { turns_typed: human.length, tool_calls: calls.size, files_touched: files.size || null,
          commits: edits || commits ? commits : null,
          duration_s: stamps.length >= 2 ? Math.trunc(Math.max(...stamps) - Math.min(...stamps)) : null,
          started: stamps.length ? Math.min(...stamps) : null, rhythm, route: folderRoute(touched) };
      },
    };
  }

  const MESSAGES = {
    "no-turns": "This file has no turn a person typed, so there is nothing to put on a card.",
    delegated: "This Codex session was run by another agent, not typed by a person.",
    unknown: "This does not look like a Claude Code, Cursor or Codex session file. Pick a .jsonl file from one of the folders listed.",
    empty: "This file is empty.",
    binary: "This file is not text. Pick a .jsonl session file.",
  };
  function readError(code) {
    const e = new Error(MESSAGES[code] || MESSAGES.unknown);
    e.code = code;
    return e;
  }

  // Which harness wrote this record. Codex wraps every record in a payload; Claude Code tags
  // records user/assistant with a session uuid; Cursor records are a bare role and message.
  function detect(o) {
    if (isObj(o.payload) && typeof o.type === "string") return codexReader;
    if ((o.type === "user" || o.type === "assistant") && isObj(o.message)) return claudeReader;
    if (["summary", "system", "file-history-snapshot", "attachment", "queue-operation"].includes(o.type) && ("sessionId" in o || "uuid" in o || "leafUuid" in o || "messageId" in o)) return claudeReader;
    if ((o.role === "user" || o.role === "assistant") && isObj(o.message) && o.type === undefined) return cursorReader;
    return null;
  }

  // Same bounded usage rules as agentgrinder/capture_metadata.py. Keep counters and
  // deduplication IDs only; no prompt, command, path or message body leaves this reader.
  function usageReader() {
    const models=new Set(),usages=new Map(),keys=['input_tokens','output_tokens','cached_input_tokens','reasoning_tokens'];
    let epoch=0,priorTotal=null;
    const count=v=>Number.isSafeInteger(v)&&v>=0;
    const model=v=>{if(typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+\-]{0,119}$/.test(v))models.add(v)};
    const valid=u=>count(u.input_tokens)&&count(u.output_tokens)&&count(u.input_tokens+u.output_tokens)&&keys.every(k=>u[k]==null||count(u[k]))&&(u.cached_input_tokens==null||u.cached_input_tokens<=u.input_tokens)&&(u.reasoning_tokens==null||u.reasoning_tokens<=u.output_tokens);
    return {
      add(row,harness){
        const p=isObj(row.payload)?row.payload:{},msg=isObj(row.message)?row.message:{};
        if(harness==='Codex'){
          if(row.type==='turn_context')model(p.model);
          if(row.type!=='event_msg'||p.type!=='token_count')return;
          const info=isObj(p.info)?p.info:{},u=isObj(info.last_token_usage)?info.last_token_usage:{},t=isObj(info.total_token_usage)?info.total_token_usage:{};
          if(!count(t.input_tokens)||!count(t.output_tokens))return;
          const current=[t.input_tokens,t.output_tokens];
          if(priorTotal&&current.some((v,i)=>v<priorTotal[i]))epoch++;
          priorTotal=current;
          if(valid(u))usages.set([epoch,...current].join(':'),Object.fromEntries(keys.filter(k=>u[k]!=null).map(k=>[k,u[k]])));
        }else if(harness==='Claude Code'){
          if(row.type!=='assistant'||row.isSidechain)return;
          model(msg.model);const u=msg.usage,id=msg.id;
          if(!isObj(u)||typeof id!=='string'||!id.trim()||!count(u.input_tokens)||!count(u.output_tokens))return;
          const cache=u.cache_read_input_tokens===undefined?0:u.cache_read_input_tokens,creation=u.cache_creation_input_tokens===undefined?0:u.cache_creation_input_tokens;
          if(!count(cache)||!count(creation))return;
          const current={input_tokens:u.input_tokens+cache+creation,output_tokens:u.output_tokens,cached_input_tokens:cache};
          if(!valid(current))return;
          const prior=usages.get(id)||{},merged=Object.fromEntries(Object.entries(current).map(([k,v])=>[k,Math.max(v,prior[k]||0)]));
          if(valid(merged))usages.set(id,merged);
        }else{
          const info=msg.modelInfo||row.modelInfo||{};if(isObj(info))model(info.modelName);
        }
      },
      done(harness){
        const out={models:[...models].sort().slice(0,32),basis:({'Codex':'codex-records','Claude Code':'claude-message-usage'})[harness]||'cursor-model-info'};
        if(usages.size){const values=[...usages.values()],sum={};for(const k of keys)if(values.every(u=>Object.hasOwn(u,k)))sum[k]=values.reduce((n,u)=>n+u[k],0);if(valid(sum))Object.assign(out,sum)}
        return out;
      }
    };
  }

  // One reader over a sequence of lines. It holds no line after it has counted it.
  function createReader() {
    let reader = null, lines = 0, records = 0, bad = 0;
    const usage=usageReader();
    return {
      line(raw) {
        lines += 1;
        const s = raw.trim();
        if (!s) return;
        let o;
        try { o = JSON.parse(s); } catch (_) { bad += 1; return; }
        if (!isObj(o)) return;
        records += 1;
        if (!reader) {
          const make = detect(o);
          if (!make) return;
          reader = make();
        }
        usage.add(o,reader.harness);reader.add(o);
      },
      finish() {
        if (!lines) throw readError("empty");
        // Text that is not JSON lines (a README, a CSV) is the wrong file, not a broken one.
        if (!reader) throw readError(records || bad ? "unknown" : "empty");
        const out = reader.done();
        return { harness: reader.harness, ...out, capture_metadata:usage.done(reader.harness), started: out.started == null ? null : new Date(out.started * 1000).toISOString() };
      },
    };
  }

  function parseText(text) {
    const r = createReader();
    for (const line of String(text).split("\n")) r.line(line);
    return r.finish();
  }

  // A File or Blob, read as a stream of decoded chunks so a 500 MB session never sits in memory
  // as one string. onProgress(bytesRead, totalBytes) is called as chunks arrive.
  async function parseFile(file, onProgress) {
    if (!file || typeof file.size !== "number") throw readError("empty");
    if (file.size === 0) throw readError("empty");
    const r = createReader();
    const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
    if (head.includes(0)) throw readError("binary");
    const reader = file.stream().getReader();
    const decoder = new TextDecoder("utf-8");
    let rest = "", read = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      const text = rest + decoder.decode(value, { stream: true });
      const parts = text.split("\n");
      rest = parts.pop();
      for (const line of parts) r.line(line);
      if (onProgress) onProgress(read, file.size);
    }
    rest += decoder.decode();
    if (rest) r.line(rest);
    return r.finish();
  }

  // THE ONLY THING THAT MAY LEAVE THE DEVICE. "Anyone with the link" sends exactly this object, and the
  // database refuses any key that is not on the same list (supabase/strava/011_dropin_links.sql).
  const UPLOAD_KEYS = ["title", "harness", "turns_typed", "tool_calls", "files_touched", "commits", "duration_s", "started_hour", "rhythm", "route"];
  function uploadPayload(run, title) {
    const whole = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
    const started = run.started ? new Date(run.started) : null;
    return {
      title: String(title || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 80),
      harness: HARNESSES.includes(run.harness) ? run.harness : null,
      turns_typed: whole(run.turns_typed),
      tool_calls: whole(run.tool_calls),
      files_touched: whole(run.files_touched),
      commits: whole(run.commits),
      duration_s: whole(run.duration_s),
      started_hour: started && Number.isFinite(started.getTime()) ? started.getHours() : null,
      rhythm: (Array.isArray(run.line) && run.line.length ? run.line : Array.isArray(run.rhythm) ? run.rhythm : []).slice(0, 24).map((v) => whole(v) ?? 0),
      // Station indices only (folderRoute); a run that touched no file has no map.
      route: Array.isArray(run.route) && run.route.length && run.route.length <= MAX_MOVES && run.route.every((v) => Number.isInteger(v) && v >= 0 && v < MAX_STATIONS) ? run.route : null,
    };
  }

  const api = { parseText, parseFile, createReader, uploadPayload, folderRoute, UPLOAD_KEYS, HARNESSES, isHumanTurn, cursorTime, seconds };
  root.GrinderDropin = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
