/**
 * Executes the real profile view from site/index.html in jsdom and prints what each reader gets.
 *
 * Real code under test: profileLinksHtml, profileProjectsHtml and viewProfile (sliced from
 * site/index.html), with the real auth.js, feed-card.js, activity-order.js, run-links.js,
 * run-contract.js and run-context.js. Stubbed: the page frame, the card renderer (it prints one
 * marker per run so order and membership are readable) and the database client.
 *
 * The database stub records every filter the page asks for and then applies it, so a row the page
 * did not ask for is never returned. It stands in for a reader who is on the owner's close-friends
 * list: row-level security can only narrow that result further.
 *
 * Usage: node tests/fixtures/profile_view_probe.mjs  -> JSON keyed by scenario name.
 * All rows are TEST DATA.
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const site = new URL("../../site/", import.meta.url);
const read = (name) => readFileSync(new URL(name, site), "utf8");
const INDEX = read("index.html");
if (INDEX.indexOf('<script src="/project-update.js"></script>') < 0 || INDEX.indexOf('<script src="/project-update.js"></script>') > INDEX.indexOf('<script src="/auth.js"></script>')) throw new Error("Profile context validator must load before profile editing");
const between = (start, end) => {
  const a = INDEX.indexOf(start);
  const b = INDEX.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error("profile probe: missing source marker " + (a < 0 ? start : end));
  return INDEX.slice(a, b);
};
const line = (start) => between(start, "\n");

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const id = (n) => `11111111-1111-4111-8111-00000000000${n}`;
const profile = { id: OWNER, handle: "ada", display_name: "TEST DATA Ada", github_handle: "ada-gh", x_handle: "ada_x", avatar_url: "https://example.test/ada.png", rig: {} };
const row = (n, visibility, extra = {}) => ({
  id: id(n), profile_id: OWNER, visibility, title: "TEST DATA run " + n, project: "TEST DATA project",
  started_at: `2026-10-0${n}T10:00:00Z`, created_at: `2026-10-0${n}T10:00:00Z`, pinned_at: null,
  profiles: { handle: "ada", display_name: "TEST DATA Ada" }, ...extra,
});
// Newest first is 7..1. Pins: 2 (public, newest pin), 5 (close friends), 6 (private), 1 (public, oldest pin).
const ROWS = [
  row(1, "public", { pinned_at: "2026-10-08T01:00:00Z" }),
  row(2, "public", { pinned_at: "2026-10-08T04:00:00Z" }),
  row(3, "public"),
  row(4, "link"),
  row(5, "close_friends", { pinned_at: "2026-10-08T03:00:00Z" }),
  row(6, "private", { pinned_at: "2026-10-08T02:00:00Z" }),
  row(7, "anonymous"),
];

async function scenario({ viewer, preview = false, providers = ["github"], rows = ROWS, prof = profile }) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
    url: "https://strive.test/?u=ada" + (preview ? "&preview=public" : ""), runScripts: "outside-only",
  });
  const w = dom.window;
  for (const file of ["project-update.js", "run-links.js", "activity-order.js", "run-contract.js", "run-context.js", "feed-card.js", "auth.js"]) w.eval(read(file));
  const calls = [];
  w.__probe = {
    calls, prof, providers,
    me: viewer === "owner" ? { ...prof } : viewer === "other" ? { id: "00000000-0000-4000-8000-0000000000b2", handle: "bea" } : null,
    client: {
      from(table) {
        const filters = [];
        const q = {
          select() { return q; },
          eq(column, value) { calls.push(["eq", column, value]); filters.push((r) => r[column] === value); return q; },
          in(column, values) { calls.push(["in", column, [...values]]); filters.push((r) => values.includes(r[column])); return q; },
          order() { return q; },
          limit() { return q; },
          then(resolve, reject) {
            if (table !== "runs") return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            return Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r })), error: null }).then(resolve, reject);
          },
        };
        return q;
      },
    },
  };
  w.eval(`
    const P=window.__probe;
    const $=id=>document.getElementById(id);
    let ME=P.me, AUTH_USER=null, AUTH_GENERATION=0;
    const PROVIDERS_ENABLED=P.providers;
    const sb=P.client;
    const auth={byHandle:async()=>P.prof};
    const frame=()=>{}, railHtml=()=>'', skeletonCard=()=>'', status=()=>{}, noteTraces=()=>{}, noteLooked=()=>{}, setPrimarySection=()=>{}, wireKudos=()=>{}, countUp=()=>{};
    const ackData=async()=>({counts:{},mine:new Set(),countsKnown:true});
    const grindShape=()=>({}), vptTotals=()=>({}), heatmapSvg=()=>'', toolLogoHtml=()=>'', avatar=()=>'<span class="probe-trace-tile"></span>';
    const social={followControl:async()=>{}};
    const feedCards=async(runs)=>runs.map(r=>'<article class="probe-run" data-run-id="'+r.id+'" data-visibility="'+r.visibility+'"></article>').join('');
    ${line("const isAgentProfile=")}
    ${line("const esc=s=>")}
    ${line("const profileHandle=")}
    ${between("function profileLinksHtml(prof,mine){", "// TIME ON A RUN")}
    ${between("function profileProjectsHtml(", "async function viewCloseFriends(")}
    window.__view=()=>viewProfile('ada');
  `);
  await w.__view();
  const doc = w.document;
  const app = doc.getElementById("app");
  const short = (el) => Number(el.dataset.runId.slice(-1));
  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
  const pinned = [...app.querySelectorAll("section.pinned .probe-run")].map(short);
  const all = [...app.querySelectorAll(".probe-run")];
  const before = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & w.Node.DOCUMENT_POSITION_FOLLOWING));
  const heading = [...app.querySelectorAll(".head > h2")].find((h) => h.textContent === "Activities") || null;
  const publicCell = [...app.querySelectorAll(".ptotals .k")].find((k) => k.textContent === "Public runs") || null;
  const stats = Object.fromEntries([...app.querySelectorAll(".profile-activity-stats > div")].map((d) => [text(d.querySelector("span")), text(d.querySelector("strong"))]));
  const links = app.querySelector(".p-links");
  const face = app.querySelector(".phero > :first-child");
  const out = {
    filters: calls,
    rendered: all.map(short),
    renderedVisibilities: [...new Set(all.map((el) => el.dataset.visibility))].sort(),
    pinned,
    pinnedMeta: text(app.querySelector("section.pinned .meta")),
    recent: all.map(short).filter((n) => !pinned.includes(n)),
    pinnedBeforeActivities: before(app.querySelector("section.pinned"), heading),
    lastPinnedBeforeFirstRecent: pinned.length ? before([...app.querySelectorAll("section.pinned .probe-run")].at(-1), all.find((el) => !el.closest("section.pinned"))) : null,
    activitiesMeta: text(heading?.parentElement.querySelector(".meta")),
    publicRunsCell: publicCell ? Number(publicCell.nextElementSibling.dataset.count) : null,
    statLabels: Object.keys(stats),
    statRuns: stats.Runs,
    scope: text(app.querySelector(".profile-header > .profile-stats-scope")),
    publicNote: text(app.querySelector(".profile-public-note")),
    emptyTitle: text(app.querySelector(".empty h3")),
    emptyBody: text(app.querySelector(".empty p")),
    nextSlot: !all.length && !app.querySelector(".empty") && viewer === "owner" && !preview,
    viewMode: text(app.querySelector(".profile-view-mode span")),
    links: links ? [...links.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]) : [],
    faceClass: face ? face.className : null,
    faceSize: face ? face.getAttribute("style") : null,
    faceImg: face?.querySelector("img")?.getAttribute("src") || null,
    editButton: !!doc.getElementById("edit-profile-open"),
    editDialog: !!doc.getElementById("profile-edit-dialog"),
    followSlot: !!doc.getElementById("social-follow"),
    projectsBeforeActivities: before(doc.getElementById("profile-projects-title"), heading),
    headerBeforeProjects: before(app.querySelector(".profile-name h1"), doc.getElementById("profile-projects-title")),
    name: text(app.querySelector(".profile-name h1")),
    text: text(app),
  };
  w.close();
  return out;
}

const agent = { ...profile, rig: { agent: true } };
const noLinks = { ...profile, github_handle: null, x_handle: null, avatar_url: null };
const privateBackfill = Array.from({ length: 497 }, (_, n) => ({
  ...row(6, "private"),
  id: `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`,
  started_at: `2026-10-23T${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00Z`,
  created_at: `2026-10-23T${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00Z`,
}));
const result = {
  owner: await scenario({ viewer: "owner" }),
  ownerPreview: await scenario({ viewer: "owner", preview: true }),
  other: await scenario({ viewer: "other" }),
  anonymous: await scenario({ viewer: null }),
  otherEmpty: await scenario({ viewer: "other", rows: [ROWS[3], ROWS[5]] }),
  anonymousEmpty: await scenario({ viewer: null, rows: [ROWS[3], ROWS[5]] }),
  ownerEmpty: await scenario({ viewer: "owner", rows: [] }),
  ownerPrivateBackfill: await scenario({ viewer: "owner", rows: [...privateBackfill, ROWS[0], ROWS[1], ROWS[2]] }),
  ownerNoLinksGithubOnly: await scenario({ viewer: "owner", prof: noLinks, providers: ["github"] }),
  ownerNoLinksX: await scenario({ viewer: "owner", prof: noLinks, providers: ["github", "x"] }),
  ownerNoLinksTwitter: await scenario({ viewer: "owner", prof: noLinks, providers: ["github", "twitter"] }),
  otherNoLinksX: await scenario({ viewer: "other", prof: noLinks, providers: ["github", "x"] }),
  agent: await scenario({ viewer: null, prof: agent }),
};
process.stdout.write(JSON.stringify(result));
