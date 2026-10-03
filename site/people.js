/* Friends / people lane. Presentation only — never invents ownership from a typed handle. */
window.GrinderPeople = function ({
  client: db,
  me,
  app,
  frame,
  railHtml,
  feedTabs,
  setPrimarySection,
  status,
  social,
  renderRuns,
  drawAvatar,
}) {
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const byId = (id) => document.getElementById(id);
  const draw =
    drawAvatar ||
    (typeof window.avatar === "function" && window.avatar) ||
    (typeof globalThis.avatar === "function" && globalThis.avatar) ||
    null;

  /** Stable presentation over current github_handle/name and future handle/display_name/avatar_url. */
  function present(profile) {
    if (!profile || typeof profile !== "object") {
      return {
        id: null,
        handle: null,
        display_name: null,
        avatar_url: null,
        label: "A builder",
        href: null,
      };
    }
    const handle =
      (typeof profile.handle === "string" && profile.handle.trim()) ||
      (typeof profile.github_handle === "string" && profile.github_handle.trim()) ||
      null;
    const display_name =
      (typeof profile.display_name === "string" && profile.display_name.trim()) ||
      (typeof profile.name === "string" && profile.name.trim()) ||
      null;
    const avatar_url =
      typeof profile.avatar_url === "string" && /^https?:\/\//i.test(profile.avatar_url)
        ? profile.avatar_url
        : null;
    return {
      id: profile.id || null,
      handle,
      display_name,
      avatar_url,
      label: display_name || (handle ? "@" + handle : "A builder"),
      href: handle ? "/?u=" + encodeURIComponent(handle) : null,
    };
  }

  function profileLink(profile) {
    const p = present(profile);
    if (!p.href) return esc(p.label);
    return `<a href="${p.href}">${esc(p.label)}</a>`;
  }

  function shareUrl(profile) {
    const p = present(profile);
    if (!p.href || typeof location === "undefined") return null;
    return location.origin + p.href;
  }

  async function result(query) {
    const r = await query;
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }

  function fail(error) {
    status(
      typeof GrinderContract !== "undefined" && GrinderContract.message
        ? GrinderContract.message(error)
        : String(error?.message || error),
      true,
    );
  }

  function emptyCard(title, body, actionsHtml) {
    return `<article class="card people-empty"><h3>${esc(title)}</h3><p>${esc(body)}</p>${actionsHtml || ""}</article>`;
  }

  async function accessToken() {
    const { data, error } = await db.auth.getSession();
    if (error) throw new Error(error.message);
    return data?.session?.access_token || null;
  }

  function personCard(row, opts) {
    const p = present(row);
    const meta = [];
    if (opts?.public_runs != null) {
      meta.push(
        opts.public_runs
          ? opts.public_runs +
              (opts.public_runs === 1 ? " public run" : " public runs")
          : "No public runs yet",
      );
    }
    if (opts?.following) meta.push("Following");
    const tile = draw && p.handle
      ? draw(p.handle, { size: 36 })
      : p.avatar_url
        ? `<img class="people-avatar" src="${esc(p.avatar_url)}" alt="" width="36" height="36">`
        : `<span class="people-avatar people-avatar-fallback" aria-hidden="true"></span>`;
    const followSlot = opts?.followSlot
      ? `<div class="people-follow" data-profile-id="${esc(p.id || "")}"></div>`
      : "";
    return `<article class="card people-card" data-profile-id="${esc(p.id || "")}">
      <div class="people-card-main">
        ${tile}
        <div class="people-card-copy">
          <h3>${p.href ? `<a href="${p.href}">${esc(p.display_name || p.handle || "Builder")}</a>` : esc(p.label)}</h3>
          <p class="people-handle">${p.handle ? "@" + esc(p.handle) : "Handle not set"}</p>
          ${meta.length ? `<p class="meta">${esc(meta.join(" · "))}</p>` : ""}
        </div>
      </div>
      ${followSlot}
      ${p.href ? `<div class="people-card-actions"><a class="act" href="${p.href}">Open profile</a></div>` : ""}
    </article>`;
  }

  function peopleTabs(active) {
    if (typeof feedTabs === "function") {
      return feedTabs(active);
    }
    return `<nav class="feed-tabs people-tabs" aria-label="Feed filters">
      <a href="/?people" class="${active === "people" ? "on" : ""}" ${active === "people" ? 'aria-current="page"' : ""}>Find people</a>
      <a href="/?explore" class="${active === "discover" ? "on" : ""}">Discover runs</a>
      <a href="/?following" class="${active === "following" ? "on" : ""}">Following</a>
    </nav>`;
  }

  async function wireFollowSlots(root) {
    if (!social?.followControl || !me?.()) return;
    const slots = root.querySelectorAll(".people-follow[data-profile-id]");
    for (const slot of slots) {
      const id = slot.getAttribute("data-profile-id");
      if (!id) continue;
      try {
        const rows = await result(
          db.from("profiles").select("*").eq("id", id).limit(1),
        );
        const person = Array.isArray(rows) ? rows[0] : rows;
        if (person) await social.followControl(person, slot);
      } catch (e) {
        slot.textContent = "Follow unavailable";
      }
    }
  }

  async function discover(initialQuery) {
    frame(typeof railHtml === "function" ? railHtml("people") : null, null);
    if (typeof setPrimarySection === "function") setPrimarySection("discover");
    const q0 =
      typeof initialQuery === "string"
        ? initialQuery
        : new URLSearchParams(location.search).get("q") || "";
    const self = me?.();
    const links = self && typeof window.GrinderAuth?.linksOf === "function" ? window.GrinderAuth.linksOf(self) : {};
    const linked = [links.github ? `GitHub @${links.github.handle}` : "", links.x ? `X @${links.x.handle} (unverified)` : ""].filter(Boolean);
    const githubAction = !self
      ? '<button type="button" id="people-network-signin" class="act">Sign in to find friends</button>'
      : links.github
        ? '<button type="button" id="people-github-friends" class="act">Find friends on GitHub</button>'
        : '<a class="act" href="/?account">Link GitHub to find friends</a>';
    app().innerHTML =
      peopleTabs("people") +
      `<div class="head"><h2>Find people</h2></div>
      <section class="card pad people-networks"><h3>People from your networks</h3>
        <p>${linked.length ? `Linked to ${esc(linked.join(" and "))}. ` : ""}GitHub matching only checks verified STRIVE accounts when you ask. It never follows anyone automatically. X friend matching is unavailable.</p>
        <div class="cta">${githubAction}${self ? '<a class="act ghost" href="/?account">Manage linked accounts</a>' : ""}</div>
        <div id="people-network-result" class="people-network-result" aria-live="polite"></div>
      </section>
      <details class="people-search-panel" ${q0 ? "open" : ""}><summary>Search by STRIVE username</summary><form id="people-search" class="people-search" role="search">
        <label for="people-query">Username or name</label>
        <div class="people-search-row">
          <input id="people-query" name="q" type="search" maxlength="80" autocomplete="off" spellcheck="false" placeholder="e.g. @casey or Ada" value="${esc(q0)}">
          <button type="submit">Search</button>
        </div>
      </form></details>
      <div id="people-body" class="people-body" aria-live="polite">Loading…</div>`;
    const form = byId("people-search");
    const input = byId("people-query");
    const body = byId("people-body");
    byId("people-network-signin")?.addEventListener("click", () => byId("auth")?.click());
    byId("people-github-friends")?.addEventListener("click", () => loadGithubFriends().catch(fail));
    form.onsubmit = (e) => {
      e.preventDefault();
      const q = input.value.trim();
      const next = q ? "/?people&q=" + encodeURIComponent(q) : "/?people";
      history.replaceState(null, "", next);
      load(q).catch(fail);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        input.value = "";
        history.replaceState(null, "", "/?people");
        load("").catch(fail);
      }
    });
    await load(q0.trim());
  }

  async function loadGithubFriends() {
    const button = byId("people-github-friends");
    const slot = byId("people-network-result");
    if (!button || !slot) return;
    button.disabled = true;
    button.textContent = "Checking GitHub…";
    slot.innerHTML = '<p class="meta">Looking for verified STRIVE accounts you follow on GitHub…</p>';
    try {
      const token = await accessToken();
      if (!token) throw new Error("Sign in again to check GitHub.");
      const response = await fetch("/api/github-friends", {
        headers: { Authorization: `Bearer ${token}` },
      });
      let payload = null;
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(payload?.message || payload?.error || "GitHub friends could not load.");
      if (payload?.scope !== "public_github_following") throw new Error("GitHub returned an unexpected connection scope.");
      const people = Array.isArray(payload?.people) ? payload.people : [];
      const scanned = Number.isFinite(Number(payload?.scanned)) ? Number(payload.scanned) : null;
      const truncated = payload?.truncated === true;
      if (!people.length) {
        const scope = scanned === null ? "" : ` ${scanned} GitHub account${scanned === 1 ? " was" : "s were"} checked.`;
        slot.innerHTML = emptyCard(
          "No matching public GitHub connections",
          `No verified STRIVE account matched the public GitHub accounts you follow.${scope}${truncated ? " GitHub limited this check, so it may not cover everyone you follow." : ""}`,
          '<div class="cta"><a class="act" href="/?explore">Discover public runs</a></div>',
        );
      } else {
        slot.innerHTML = `<div class="head"><h3>Friends on STRIVE</h3><span class="meta">${people.length}</span></div>${people.map((person) => personCard(person, { followSlot: true })).join("")}${truncated ? '<p class="hint">GitHub limited this check, so more matches may exist.</p>' : ""}`;
        await wireFollowSlots(slot);
      }
    } catch (error) {
      slot.innerHTML = emptyCard(
        "GitHub friends could not load",
        String(error?.message || "Try again in a moment."),
        '<div class="cta"><button type="button" id="people-github-retry" class="act">Try again</button></div>',
      );
      byId("people-github-retry")?.addEventListener("click", () => loadGithubFriends().catch(fail));
    } finally {
      button.disabled = false;
      button.textContent = "Find friends on GitHub";
    }
  }

  async function load(query) {
    const body = byId("people-body");
    if (!body) return;
    body.innerHTML = "<p>Loading…</p>";
    try {
      if (query) {
        const rows = await result(
          db.rpc("grinder_find_people", { q: query, lim: 20 }),
        );
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) {
          body.innerHTML = emptyCard(
            "No matching builder",
            "Handles are only matched against signed-up profiles. Typing a name does not create or claim an account.",
            `<div class="cta"><a class="act" href="/?explore">Browse public runs</a><a class="act ghost" href="/?people">Clear search</a></div>`,
          );
          return;
        }
        body.innerHTML =
          `<div class="head"><h2>Matches</h2><span class="meta">${list.length}</span></div>` +
          list.map((row) => personCard(row, { followSlot: true })).join("");
        await wireFollowSlots(body);
        return;
      }

      const self = me?.();
      const following = self
        ? await result(
            db
              .from("grinder_follows")
              .select(
                "followed_id,followed:profiles!grinder_follows_followed_id_fkey(id,github_handle,name)",
              )
              .eq("follower_id", self.id)
              .order("created_at", { ascending: false })
              .limit(24),
          ).catch(() =>
            result(
              db
                .from("grinder_follows")
                .select("followed_id")
                .eq("follower_id", self.id)
                .limit(24),
            ).then(async (ids) => {
              if (!ids.length) return [];
              const profiles = await result(
                db
                  .from("profiles")
                  .select("*")
                  .in(
                    "id",
                    ids.map((f) => f.followed_id),
                  ),
              );
              return profiles.map((p) => ({ followed_id: p.id, followed: p }));
            }),
          )
        : [];

      let recent = null;
      try {
        recent = await result(db.rpc("grinder_recent_builders", { lim: 12 }));
      } catch (_) {
        recent = null;
      }
      if(recent!==null) recent = Array.isArray(recent) ? recent : [];

      const parts = [];
      if (!self) {
        parts.push(
          emptyCard(
            "Sign in to follow builders",
            "You can still search public profiles. Sign in to follow someone and fill your Following feed.",
            `<div class="cta"><button type="button" id="people-signin" class="act blue">Sign in</button><a class="act" href="/?explore">Browse public runs</a></div>`,
          ),
        );
      }

      const followed = (following || [])
        .map((f) => f.followed || f)
        .filter((p) => p && p.id);
      if (self && !followed.length) {
        parts.push(
          emptyCard(
            "You are not following anyone yet",
            "Search for a STRIVE username, or open a profile from a public run and choose Follow.",
            `<div class="cta"><a class="act" href="/?following">Open Following</a><a class="act" href="/?explore">Discover runs</a></div>`,
          ),
        );
      } else if (followed.length) {
        parts.push(
          `<section class="people-section"><div class="head"><h2>People you follow</h2><span class="meta">${followed.length}</span></div>` +
            followed
              .map((p) => personCard(p, { following: true, followSlot: true }))
              .join("") +
            `</section>`,
        );
      }

      if (recent === null) {
        parts.push(
          emptyCard(
            "Suggested people could not load",
            "Public runs may still be available. Refresh to try loading people again.",
            `<div class="cta"><button type="button" id="people-retry" class="act">Try again</button><a class="act" href="/?explore">Open the feed</a></div>`,
          ),
        );
      } else if (recent.length) {
        parts.push(
          `<section class="people-section"><div class="head"><h2>Builders with public runs</h2><span class="meta">${recent.length}</span></div>` +
            recent
              .map((p) =>
                personCard(p, {
                  public_runs: Number(p.public_runs) || 0,
                  followSlot: !!self,
                }),
              )
              .join("") +
            `</section>`,
        );
      } else {
        parts.push(
          emptyCard(
            "No other builders with public runs yet",
            "Your own profile is not shown as a suggestion.",
            `<div class="cta"><a class="act" href="/?explore">Open the feed</a></div>`,
          ),
        );
      }

      body.innerHTML = parts.join("");
      byId("people-retry")?.addEventListener("click", () => load(query).catch(fail));
      const signin = byId("people-signin");
      if (signin) {
        signin.onclick = () => {
          try {
            sessionStorage.setItem("ag_social_return", "?people");
          } catch (_) {}
          byId("auth")?.click();
        };
      }
      await wireFollowSlots(body);
    } catch (e) {
      body.innerHTML = emptyCard(
        "People could not load",
        "Your follows were not changed. Try again in a moment.",
        `<div class="cta"><button type="button" id="people-retry" class="act">Try again</button></div>`,
      );
      byId("people-retry")?.addEventListener("click", () => load(query).catch(fail));
      fail(e);
    }
  }

  /**
   * Shareable profile surface for root integration. Resolves by stored handle only —
   * never creates a profile from the URL.
   */
  async function profile(handleOrId) {
    frame(typeof railHtml === "function" ? railHtml("profile") : null, null);
    if (typeof setPrimarySection === "function") setPrimarySection("feed");
    app().innerHTML = '<div class="card"><p>Loading profile…</p></div>';
    const key = String(handleOrId || "").trim();
    if (!key) {
      app().innerHTML = emptyCard(
        "Profile not found",
        "This link has no handle.",
        `<div class="cta"><a class="act" href="/?people">Find people</a></div>`,
      );
      return null;
    }
    try {
      let person = null;
      const uuid = /^[0-9a-f-]{36}$/i.test(key);
      if (uuid) {
        const rows = await result(
          db.from("profiles").select("*").eq("id", key).limit(1),
        );
        person = Array.isArray(rows) ? rows[0] : rows;
      } else {
        // Prefer future handle column when Claude lands identity migration; fall back.
        let rows = await result(
          db.from("profiles").select("*").eq("github_handle", key).limit(1),
        );
        person = Array.isArray(rows) ? rows[0] : rows;
        if (!person) {
          try {
            rows = await result(
              db.from("profiles").select("*").eq("handle", key).limit(1),
            );
            person = Array.isArray(rows) ? rows[0] : rows;
          } catch (_) {
            person = null;
          }
        }
      }
      if (!person) {
        app().innerHTML = emptyCard(
          "No such builder",
          "This handle is not a signed-up profile. Searching or opening a URL does not create an account.",
          `<div class="cta"><a class="act" href="/?people">Find people</a><a class="act" href="/?explore">Browse runs</a></div>`,
        );
        return null;
      }
      const p = present(person);
      const mine = me?.() && me().id === person.id;
      let responseReturn = "";
      try {
        if (sessionStorage.getItem("ag_response_return") === "?inbox") {
          responseReturn =
            '<p class="response-return"><a class="act" href="/?inbox">Back to Notifications</a></p>';
        }
      } catch (_) {}
      const { data: runs, error } = await db
        .from("runs")
        .select("*, profiles!runs_profile_id_fkey(github_handle,name,rig)")
        .eq("profile_id", person.id)
        [mine ? "in" : "eq"](
          "visibility",
          mine ? ["public", "link", "private", "anonymous"] : "public",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const R = runs || [];
      const avatarHtml = (() => {
        if (draw && p.handle) return draw(p.handle, { size: 40 });
        if (p.avatar_url)
          return `<img class="people-avatar" src="${esc(p.avatar_url)}" alt="" width="40" height="40">`;
        return "";
      })();
      app().innerHTML = `${peopleTabs("people")}${responseReturn}
        <div class="phero people-hero">
          ${avatarHtml}
          <div>
            <h1>${esc(p.display_name || p.handle || "Builder")}</h1>
            <div class="h">${p.handle ? "@" + esc(p.handle) : "Handle not set"}</div>
          </div>
        </div>
        <div id="social-follow" class="social-follow"></div>
        <div class="cta people-profile-cta">
          <button type="button" id="people-share" class="act">Copy profile link</button>
          <a class="act" href="/?people">Find people</a>
          ${mine ? "" : `<a class="act" href="/?following">Following</a>`}
        </div>
        <div class="head"><h2>${mine ? "Your runs" : "Public runs"}</h2><span class="meta">${R.length || "none yet"}</span></div>
        <div id="people-runs">${R.length ? "Loading runs…" : ""}</div>`;
      if (!R.length) {
        byId("people-runs").innerHTML = emptyCard(
          mine ? "No runs yet" : "No public runs yet",
          mine
            ? "Share your profile so friends can follow you now. Post when you have a real session."
            : "You can still follow this builder. Their public runs will appear here and in Following when they post.",
          mine
            ? `<div class="cta"><a class="act blue" href="/?post">Post a run</a></div>`
            : `<div class="cta"><a class="act" href="/?following">Open Following</a></div>`,
        );
      } else if (typeof renderRuns === "function") {
        byId("people-runs").innerHTML = await renderRuns(R);
      } else {
        byId("people-runs").innerHTML = R.map((r) => {
          const title = esc(r.title || "Run");
          return `<article class="card"><h3><a href="/?run=${encodeURIComponent(r.id)}">${title}</a></h3><p class="meta"><a href="/?run=${encodeURIComponent(r.id)}#grind-thread">Respond</a></p></article>`;
        }).join("");
      }
      if (social?.followControl) {
        await social.followControl(person, byId("social-follow"));
      }
      byId("people-share").onclick = async () => {
        const url = shareUrl(person);
        try {
          await navigator.clipboard.writeText(url);
          status("Profile link copied.");
        } catch (_) {
          status(url || "Could not copy.", !url);
        }
      };
      return person;
    } catch (e) {
      app().innerHTML = emptyCard(
        "Profile could not load",
        "Try again, or find people by handle.",
        `<div class="cta"><a class="act" href="/?people">Find people</a></div>`,
      );
      fail(e);
      return null;
    }
  }

  return {
    present,
    profileLink,
    shareUrl,
    discover,
    profile,
    personCard,
  };
};

window.GrinderPeople.present = function (profile) {
  return window.GrinderPeople({
    client: null,
    me: () => null,
    app: () => null,
    frame: () => {},
    status: () => {},
  }).present(profile);
};
