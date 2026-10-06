/* THE SIGNED-OUT HOME (Oscar, 25 Sep 23:1x: "landing page first, some events, clubs, events that
   are going on, wow homey. then find some friends, most popular runs. and then boom login").
   In that order: This week, Clubs, Builders, Popular runs, then the sign-in ask.

   Every row is a real row. A section with nothing in it says so in one line; nothing is seeded,
   sampled or invented. The one device is the week strip: the last seven days of public runs as
   bars and the next seven days of events as marks, so the page shows the club's week, not a pitch.
   Events need migration 014 (supabase/strava/014_social.sql); before it, that read fails and the
   strip shows runs only. */
(function (root) {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
  const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  // Calendar days, not 24-hour steps, so a daylight-saving change never repeats or skips a date.
  const addDays = (t, n) => { const d = new Date(startOfDay(t)); d.setDate(d.getDate() + n); return d.getTime(); };

  // 14 days: the last seven including today (runs), then the next seven (events). Events later
  // today are drawn on today and counted with the next seven.
  function week(runs, events, now) {
    const today = startOfDay(now);
    const days = [];
    for (let i = -6; i <= 7; i++) days.push({ t: addDays(now, i), runs: 0, events: [] });
    const byKey = new Map(days.map((d) => [dayKey(d.t), d]));
    (runs || []).forEach((r) => { const d = byKey.get(dayKey(r.created_at)); if (d && d.t <= today) d.runs++; });
    (events || []).forEach((e) => { const d = byKey.get(dayKey(e.starts_at)); if (d && d.t >= today && Date.parse(e.starts_at) >= now) d.events.push(e); });
    return { days, today };
  }

  // runs or events may be null: that read failed, and the line says so instead of "none".
  function weekHtml(runs, events, now) {
    const { days, today } = week(runs || [], events || [], now);
    const max = Math.max(1, ...days.map((d) => d.runs));
    const cols = days.map((d) => {
      const wd = new Date(d.t).toLocaleDateString("en-GB", { weekday: "narrow" });
      const n = new Date(d.t).getDate();
      const past = d.t < today, isToday = d.t === today;
      const bar = d.runs ? `<span class="wk-bar" style="--h:${Math.round((d.runs / max) * 100)}%" title="${d.runs} public run${d.runs === 1 ? "" : "s"}"></span>` : "";
      const mark = d.events.length ? `<a class="wk-ev" href="/?event=${esc(d.events[0].id)}" title="${esc(d.events[0].title)}"><span class="sr">${esc(d.events[0].title)}</span></a>` : "";
      return `<li class="wk-day${past ? " past" : ""}${isToday ? " today" : ""}"><span class="wk-plot">${bar}${mark}</span><span class="wk-d">${esc(wd)}</span><span class="wk-n">${n}</span></li>`;
    }).join("");
    const ran = days.reduce((a, d) => a + d.runs, 0);
    const coming = days.reduce((a, d) => a + d.events.length, 0);
    const runPart = runs === null ? "Runs could not load" : ran ? ran + " public run" + (ran === 1 ? "" : "s") + " in the last 7 days" : "No public runs in the last 7 days";
    const eventPart = events === null ? "events could not load" : coming ? coming + " event" + (coming === 1 ? "" : "s") + " in the next 7" : "no events in the next 7";
    const line = `${runPart} · ${eventPart}`;
    return `<ol class="wk" aria-label="This week on __BRAND__">${cols}</ol><p class="wk-line">${esc(line)}</p>`;
  }

  function eventRow(e) {
    const d = new Date(e.starts_at);
    const club = e.club ? `<span>${esc(e.club.name)}</span>` : "";
    const going = Number.isInteger(e.going) ? `<span>${e.going} going</span>` : "";
    return `<a class="ev" href="/?event=${esc(e.id)}"><span class="ev-date"><b>${d.getDate()}</b><small>${esc(d.toLocaleDateString("en-GB", { month: "short" }))}</small></span>
      <span class="ev-body"><span class="ev-t">${esc(e.title)}</span><span class="ev-meta">${esc(d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }))}${e.place ? " · " + esc(e.place) : ""}</span><span class="ev-meta">${club}${club && going ? " · " : ""}${going}</span></span></a>`;
  }

  function clubRow(c) {
    return `<a class="club" href="/?crew=${esc(c.id)}"><span class="club-mark" aria-hidden="true">${esc((c.name || "?").trim().charAt(0).toUpperCase())}</span><span class="club-t">${esc(c.name)}</span><span class="club-n">${c.members} member${c.members === 1 ? "" : "s"}</span></a>`;
  }

  // Builders who posted a public run in the window, most runs first, one row each.
  function builders(runs, limit) {
    const seen = new Map();
    (runs || []).forEach((r) => {
      if (!r.profile_id || r.visibility !== "public") return;
      const b = seen.get(r.profile_id);
      if (b) b.n++; else seen.set(r.profile_id, { run: r, n: 1 });
    });
    return [...seen.values()].sort((a, b) => b.n - a.n || String(b.run.created_at).localeCompare(String(a.run.created_at))).slice(0, limit || 6);
  }

  // Most thanks first, then newest. A run nobody thanked still counts as recent.
  function popular(runs, counts, limit) {
    return [...(runs || [])].sort((a, b) => ((counts[b.id] || 0) - (counts[a.id] || 0)) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit || 5);
  }

  // Never throws: a failed or missing read is an empty section, not a broken page.
  async function read(sb, now) {
    try { return await readAll(sb, now); } catch (_) { return { runs: null, clubs: null, events: null }; }
  }
  async function readAll(sb, now) {
    const since = new Date(addDays(now, -30)).toISOString();
    const until = new Date(addDays(now, 8)).toISOString(); // the end of the seventh day ahead
    const runsQ = sb.from("runs").select("*, profiles!runs_profile_id_fkey(github_handle,name,rig,handle,display_name,avatar_url)")
      .eq("visibility", "public").gte("created_at", since).order("created_at", { ascending: false }).limit(100);
    const clubsQ = sb.from("grinder_crews").select("id,name,visibility,created_at,grinder_memberships(count)").eq("visibility", "public").order("created_at", { ascending: false }).limit(12);
    const eventsQ = sb.from("grinder_events").select("id,title,place,starts_at,crew_id,grinder_crews(name),grinder_event_people(count)")
      .gte("starts_at", new Date(now).toISOString()).lt("starts_at", until).order("starts_at", { ascending: true }).limit(20);
    // Each section is its own read. null means that read failed, and the page says so; it never
    // turns a failure into an empty claim. A missing events table (migration 014 not applied) is
    // not a failure: no event can exist, so it reads as none.
    const MISSING_TABLE = new Set(["42P01", "PGRST205"]);
    const settle = (q, missingIsEmpty) => q.then((r) => (r.error ? (missingIsEmpty && MISSING_TABLE.has(r.error.code) ? [] : null) : r.data || []), () => null);
    const [runs, clubs, events] = await Promise.all([settle(runsQ), settle(clubsQ), settle(eventsQ, true)]);
    return {
      runs,
      clubs: clubs && clubs.map((c) => ({ id: c.id, name: c.name, members: c.grinder_memberships?.[0]?.count ?? 0 })).sort((a, b) => b.members - a.members),
      events: events && events.map((e) => ({ id: e.id, title: e.title, place: e.place, starts_at: e.starts_at, club: e.grinder_crews ? { name: e.grinder_crews.name } : null, going: e.grinder_event_people?.[0]?.count ?? 0 })),
    };
  }

  // Clubs and events as entry points on the start page, signed in or not. Real rows only. With none
  // it says so in one line and still offers the door; a failed read says it failed.
  function community(data) {
    const failed = '<p class="home-none" data-failed>Could not load. Refresh to try again.</p>';
    const events = data.events === null ? failed : data.events.length ? `<div class="evs">${data.events.slice(0, 3).map(eventRow).join("")}</div>` : '<p class="home-none">No event in the next 7 days.</p>';
    const clubs = data.clubs === null ? failed : data.clubs.length ? `<div class="clubs">${data.clubs.slice(0, 6).map(clubRow).join("")}</div>` : '<p class="home-none">No public club yet.</p>';
    return `<section class="home-community" aria-label="Clubs and events"><div class="hc-col"><div class="land-head"><h2>Events</h2></div>${events}</div><div class="hc-col"><div class="land-head"><h2 id="h-clubs">Clubs</h2><a href="/?crews">${data.clubs && data.clubs.length ? "All clubs" : "Start or join a club"}</a></div>${clubs}</div></section>`;
  }

  const api = { week, weekHtml, eventRow, clubRow, community, builders, popular, read };
  root.GrinderHome = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
