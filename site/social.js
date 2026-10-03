/* Social views use the same Supabase identity and server policies as the existing product. */
window.GrinderSocial = function ({
  client: db,
  me,
  app,
  frame,
  railHtml,
  feedTabs,
  setPrimarySection,
  status,
  renderRuns,
  signInGitHub,
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
  const uuid = (id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
  const present = (p) =>
    typeof window.GrinderPeople?.present === "function"
      ? window.GrinderPeople.present(p)
      : {
          id: p?.id || null,
          handle: p?.handle || p?.github_handle || null,
          display_name: p?.display_name || p?.name || null,
          avatar_url: p?.avatar_url || null,
          label:
            p?.display_name ||
            p?.name ||
            (p?.handle || p?.github_handle
              ? "@" + (p.handle || p.github_handle)
              : "A builder"),
          href:
            p?.handle || p?.github_handle
              ? "/?u=" + encodeURIComponent(p.handle || p.github_handle)
              : null,
        };
  const link = (p) => {
    const shown = present(p);
    if (!shown.href) return esc(shown.label);
    return `<a href="${shown.href}">${esc(shown.label)}</a>`;
  };
  const nav =
    (typeof communityTabs === "function" ? communityTabs("crews") : "") +
    '<nav class="social-nav" aria-label="Community extras"><a href="/?inbox">Inbox</a></nav>';
  function start(title, description, section) {
    const rail = typeof railHtml === "function"
      ? railHtml(section === "feed" ? "following" : section === "inbox" ? "inbox" : null)
      : null;
    frame(rail, null);
    if (typeof setPrimarySection === "function") {
      setPrimarySection(section === "inbox" ? "inbox" : section === "feed" ? "feed" : "community");
    }
    const tabs =
      section === "feed" && typeof feedTabs === "function"
        ? feedTabs("following")
        : section === "inbox"
          ? ""
          : typeof communityTabs === "function"
            ? communityTabs(section === "crews" ? "crews" : "hub")
            : nav;
    app().innerHTML =
      tabs +
      `<div class="head"><h2>${esc(title)}</h2></div><p>${esc(description)}</p><div id="social-body" aria-live="polite">Loading…</div>`;
  }
  function signedIn() {
    if (me()) return true;
    byId("social-body").innerHTML =
      '<div class="card"><p>Sign in to see notifications and follow builders. Your private runs stay in My runs.</p><button type="button" class="act blue" id="social-signin">Sign in with GitHub</button></div>';
    byId("social-signin").onclick = () => {
      try {
        sessionStorage.setItem("ag_social_return", location.search);
      } catch (_) {}
      if (typeof signInGitHub === "function") signInGitHub();
      else byId("auth").click();
    };
    return false;
  }
  async function result(query) {
    const r = await query;
    if (r.error) throw new Error(r.error.message);
    return r.data || [];
  }
  function fail(error) {
    status(GrinderContract.message(error), true);
  }
  function empty(message, actionsHtml) {
    return `<div class="card people-empty"><p>${esc(message)}</p>${actionsHtml || ""}</div>`;
  }

  const RESPONSE_RETURN_KEY = "ag_response_return";
  const SOCIAL_RETURN_RE = /^\?(post|mine|following|inbox|run|u|example|people|account|connect|explore|boards|projects?|crews?)(=|&|$)/;
  function isSocialReturn(pending) {
    return typeof pending === "string" && SOCIAL_RETURN_RE.test(pending);
  }
  function applyStoredSocialReturn() {
    try {
      if (!me()) return null;
      const pending = sessionStorage.getItem("ag_social_return");
      if (!isSocialReturn(pending)) return null;
      history.replaceState(null, "", "/" + pending);
      sessionStorage.removeItem("ag_social_return");
      return pending;
    } catch (_) {
      return null;
    }
  }

  const unreadMarked = new Set();
  let inboxObserver = null;
  let unreadMarkOwner = null;

  function resetUnreadMarks(ownerId) {
    if (ownerId && ownerId === unreadMarkOwner) return;
    unreadMarked.clear();
    unreadMarkOwner = ownerId || null;
    if (inboxObserver) {
      inboxObserver.disconnect();
      inboxObserver = null;
    }
  }

  function stashResponseReturn() {
    try {
      sessionStorage.setItem(RESPONSE_RETURN_KEY, "?inbox");
    } catch (_) {}
  }

  function peekResponseReturn() {
    try {
      return sessionStorage.getItem(RESPONSE_RETURN_KEY);
    } catch (_) {
      return null;
    }
  }

  function clearResponseReturn() {
    try {
      sessionStorage.removeItem(RESPONSE_RETURN_KEY);
    } catch (_) {}
  }

  function replyTargetId() {
    const hash = (location.hash || "").replace(/^#/, "");
    if (/^reply-[0-9a-f-]{36}$/i.test(hash)) return hash.slice(6);
    const q = new URLSearchParams(location.search).get("reply");
    return uuid(q) ? q : null;
  }

  function notificationHref(n) {
    if (n.kind === "follow") {
      const shown = present(n.actor);
      return shown.href || "/?people";
    }
    if (!n.run_id) return null;
    if (n.kind === "reply" && uuid(n.source_id)) {
      return `/?run=${encodeURIComponent(n.run_id)}&reply=${encodeURIComponent(n.source_id)}#reply-${n.source_id}`;
    }
    return `/?run=${encodeURIComponent(n.run_id)}${n.kind === "reply" ? "#grind-thread" : ""}`;
  }

  async function markNotificationsRead(ids) {
    const recipient = me()?.id;
    if (!recipient) return;
    resetUnreadMarks(recipient);
    const pending = [...new Set(ids)].filter(
      (id) => id && !unreadMarked.has(id),
    );
    if (!pending.length) return;
    pending.forEach((id) => unreadMarked.add(id));
    try {
      const updated = await result(
        db
          .from("grinder_notifications")
          .update({ read_at: new Date().toISOString() })
          .in("id", pending)
          .eq("recipient_id", recipient)
          .is("read_at", null)
          .select("id"),
      );
      // 0-row success must not poison unreadMarked (stale me() / already-read / RLS miss).
      const confirmed = new Set((updated || []).map((row) => row.id));
      for (const id of pending) {
        if (!confirmed.has(id)) unreadMarked.delete(id);
      }
      if (me()?.id !== recipient) {
        pending.forEach((id) => unreadMarked.delete(id));
        return;
      }
      const count = await refreshUnread();
      const summary = document.querySelector(".response-summary");
      if (summary) {
        const total = document.querySelectorAll(".response-item").length;
        summary.textContent = `${count ? `${count} unread · ` : ""}${total} recent`;
      }
      const unreadFilter = document.querySelector(
        '.response-filters a[href="/?inbox&filter=unread"]',
      );
      if (unreadFilter) {
        unreadFilter.textContent = count ? `Unread · ${count}` : "Unread";
      }
    } catch (e) {
      pending.forEach((id) => unreadMarked.delete(id));
      fail(e);
    }
  }

  async function refreshUnread() {
    const badges = [
      byId("nav-inbox-badge"),
      ...document.querySelectorAll(".mobile-inbox-badge"),
    ].filter(Boolean);
    if (!me()) {
      for (const badge of badges) {
        badge.hidden = true;
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = "";
      }
      return 0;
    }
    try {
      const rows = await result(
        db
          .from("grinder_notifications")
          .select("id")
          .eq("recipient_id", me().id)
          .is("read_at", null)
          .limit(50),
      );
      const count = rows.length;
      for (const badge of badges) {
        if (count > 0) {
          badge.hidden = false;
          badge.removeAttribute("aria-hidden");
          badge.textContent = count > 9 ? "9+" : String(count);
          badge.setAttribute(
            "aria-label",
            count === 1 ? "1 unread response" : `${count} unread responses`,
          );
        } else {
          badge.hidden = true;
          badge.setAttribute("aria-hidden", "true");
          badge.textContent = "";
          badge.removeAttribute("aria-label");
        }
      }
      return count;
    } catch (_) {
      return 0;
    }
  }

  async function notificationsPanel(slot) {
    if (!slot) return;
    if (!me()) {
      slot.innerHTML = '<p class="notice-empty">Sign in to see replies, thanks and new followers.</p>';
      return;
    }
    slot.innerHTML = '<p class="notice-empty">Loading…</p>';
    try {
      const rows = await result(
        db
          .from("grinder_notifications")
          .select("*,actor:profiles!grinder_notifications_actor_id_fkey(github_handle,name,handle,display_name,avatar_url)")
          .eq("recipient_id", me().id)
          .order("created_at", { ascending: false })
          .limit(20),
      );
      if (!rows.length) {
        slot.innerHTML = '<p class="notice-empty">No notifications yet. Replies, thanks and follows will appear here.</p>';
        return;
      }
      slot.innerHTML = rows.map((n) => {
        const actor = present(n.actor);
        const kind = n.kind === "reply" ? "replied to your run" : n.kind === "ack" ? "thanked your run" : "followed you";
        const href = notificationHref(n);
        return `<article class="notice-item ${n.read_at ? "read" : "unread"}" data-notification-id="${esc(n.id)}">
          <span class="notice-dot" aria-hidden="true"></span><div><p class="notice-copy"><b>${esc(actor.label)}</b> ${kind}</p>
          <p class="notice-meta">${esc(new Date(n.created_at).toLocaleString())}</p><div class="notice-links">
          ${href ? `<a href="${href}" data-notification-open="1">Open</a>` : ""}
          ${!n.read_at ? '<button type="button" data-notification-read="1">Mark read</button>' : ""}</div></div></article>`;
      }).join("");
      slot.querySelectorAll("[data-notification-open]").forEach((a) => a.addEventListener("click", () => {
        stashResponseReturn();
        const id = a.closest("[data-notification-id]")?.dataset.notificationId;
        if (id) markNotificationsRead([id]);
      }));
      slot.querySelectorAll("[data-notification-read]").forEach((button) => button.addEventListener("click", async () => {
        const item = button.closest("[data-notification-id]");
        if (!item) return;
        button.disabled = true;
        await markNotificationsRead([item.dataset.notificationId]);
        item.classList.remove("unread"); item.classList.add("read"); button.remove();
      }));
    } catch (e) {
      slot.innerHTML = '<p class="notice-empty">Notifications could not load. Try again.</p>';
      fail(e);
    }
  }

  async function markAllNotificationsRead() {
    if (!me()) return 0;
    try {
      const rows = await result(db.from("grinder_notifications").select("id").eq("recipient_id", me().id).is("read_at", null).limit(50));
      await markNotificationsRead(rows.map((row) => row.id));
      return rows.length;
    } catch (e) {
      fail(e); return 0;
    }
  }

  async function resolveNotificationTargets(rows) {
    const runIds = [
      ...new Set(rows.map((n) => n.run_id).filter((id) => uuid(id))),
    ];
    const replyIds = [
      ...new Set(
        rows
          .filter((n) => n.kind === "reply" && uuid(n.source_id))
          .map((n) => n.source_id),
      ),
    ];
    const runs = new Map();
    const replies = new Map();
    if (runIds.length) {
      try {
        const data = await result(
          db.from("runs").select("id,visibility,title").in("id", runIds),
        );
        for (const run of data) runs.set(run.id, run);
      } catch (_) {}
    }
    if (replyIds.length) {
      try {
        const data = await result(
          db.from("grinder_replies").select("id,run_id").in("id", replyIds),
        );
        for (const reply of data) replies.set(reply.id, reply);
      } catch (_) {}
    }
    return { runs, replies };
  }

  function responseReturnBar() {
    const pending = peekResponseReturn();
    if (pending !== "?inbox") return "";
    return `<p class="response-return"><a class="act" href="/?inbox">Back to Notifications</a></p>`;
  }

  // THE FOLLOWING FEED, which is also the signed-in home (25 Sep 2026 evening). Runs from the
  // people you follow come first. With nobody followed, or nobody posting yet, the page offers
  // builders to follow and then the latest public runs, so the home is never an empty page.
  async function following(opts = {}) {
    const home = !!opts.home;
    start(
      home ? "Your feed" : "Following",
      home
        ? "Public runs from the people you follow."
        : "Public runs from people you follow. Close-friends runs stay on their profile, not here.",
      "feed",
    );
    if (!signedIn()) {
      const slot = document.createElement("div");
      byId("social-body")?.appendChild(slot);
      await suggestBuilders(slot);
      return;
    }
    // The latest public runs under an empty feed. A failure here leaves the rest of the page.
    const latest = async (heading) => {
      try {
        return await latestRuns(heading);
      } catch (_) {
        return "";
      }
    };
    const latestRuns = async (heading) => {
      const runs = await result(
        db
          .from("runs")
          .select("*,profiles!runs_profile_id_fkey(github_handle,name,rig,handle,display_name,avatar_url)")
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(20),
      );
      return runs.length
        ? `<section class="home-latest" aria-label="${esc(heading)}"><div class="land-head"><h2>${esc(heading)}</h2><a href="/?explore">See all</a></div>${await renderRuns(runs)}</section>`
        : "";
    };
    try {
      const follows = await result(
        db
          .from("grinder_follows")
          .select("followed_id")
          .eq("follower_id", me().id),
      );
      if (!follows.length) {
        byId("social-body").innerHTML =
          empty(
            "You follow nobody yet. Follow a builder from a run or a profile and their public runs land here. Following is deliberate: nobody is imported or followed automatically.",
            `<div class="cta"><a class="act blue" href="/?people">Find people</a><a class="act" href="/?post">Add a run</a></div>`,
          ) + '<div id="following-suggest"></div><div id="following-latest"></div>';
        await suggestBuilders(byId("following-suggest"));
        byId("following-latest").innerHTML = await latest("Recent public runs");
        return;
      }
      const followedIds = follows.map((f) => f.followed_id);
      const runs = await result(
        db
          .from("runs")
          .select("*,profiles!runs_profile_id_fkey(github_handle,name,rig,handle,display_name,avatar_url)")
          .in("profile_id", followedIds)
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(50),
      );
      if (runs.length) {
        byId("social-body").innerHTML = responseReturnBar() + await renderRuns(runs);
        return;
      }
      const people = await result(
        db
          .from("profiles")
          .select("id,github_handle,name,handle,display_name,avatar_url")
          .in("id", followedIds)
          .limit(24),
      );
      const list = (people || [])
        .map((p) => {
          const shown = present(p);
          return shown.href
            ? `<li><a href="${shown.href}">${esc(shown.label)}</a>${shown.handle ? ` <span class="meta">@${esc(shown.handle)}</span>` : ""}</li>`
            : `<li>${esc(shown.label)}</li>`;
        })
        .join("");
      byId("social-body").innerHTML =
        empty(
          "You follow these builders, but none has a public run yet. Following only lists Public runs. Close-friends work appears on a builder profile when you are on their list.",
          `<div class="cta"><a class="act blue" href="/?post">Add a run</a><a class="act" href="/?people">Find more people</a></div>`,
        ) +
        (list
          ? `<article class="card"><h3>People you follow</h3><ul class="following-people">${list}</ul></article>`
          : "") + '<div id="following-latest"></div>';
      byId("following-latest").innerHTML = await latest("Recent public runs");
    } catch (e) {
      byId("social-body").innerHTML = empty(
        "The following feed could not load. Your follows have not changed.",
        `<div class="cta"><a class="act" href="/?people">Find people</a><a class="act" href="/?explore">Discover runs</a></div>`,
      );
      fail(e);
    }
  }

  // DAY ONE. An empty Following tab offers the builders who have posted in public, newest first,
  // each with a Follow button. Nobody is followed for the reader; the tap is theirs.
  async function suggestBuilders(slot) {
    if (!slot || typeof window.GrinderFeed !== "object") return;
    try {
      const runs = await result(
        db
          .from("runs")
          .select("id,title,profile_id,visibility,created_at,profiles!runs_profile_id_fkey(github_handle,name,handle,display_name,avatar_url)")
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(50),
      );
      const seen = new Set();
      const picks = (runs || []).filter((r) => {
        if (!r.profile_id || seen.has(r.profile_id) || (me() && me().id === r.profile_id)) return false;
        seen.add(r.profile_id);
        return true;
      }).slice(0, 6);
      if (!picks.length) return;
      slot.innerHTML = `<section class="fc-builders" aria-label="Builders to follow"><h2>Builders posting runs</h2>${picks.map((r) => window.GrinderFeed.builderRow(r)).join("")}</section>`;
      for (const el of slot.querySelectorAll(".card-follow[data-profile]")) {
        // Mark it wired first: the page-wide wiring (wireKudos) skips a wired slot, so a Follow
        // button is never drawn twice.
        el.dataset.wired = "true";
        await followControl({ id: el.dataset.profile, handle: el.dataset.handle || null, github_handle: el.dataset.handle || null }, el);
      }
    } catch (_) {}
  }

  async function followControl(person, slot) {
    if (!slot || !person?.id) return;
    try {
      if (
        sessionStorage.getItem(RESPONSE_RETURN_KEY) === "?inbox" &&
        !slot.parentElement?.querySelector(".response-return")
      ) {
        const bar = document.createElement("p");
        bar.className = "response-return";
        bar.innerHTML = '<a class="act" href="/?inbox">Back to Notifications</a>';
        slot.before(bar);
      }
    } catch (_) {}
    if (!me()) {
      const label = slot.dataset.label || "Sign in with GitHub";
      slot.innerHTML =
        `<button type="button" id="follow-signin" class="act blue">${esc(label)}</button>`;
      slot.querySelector("#follow-signin").onclick = () => {
        try {
          sessionStorage.setItem(
            "ag_social_return",
            location.search ||
              (present(person).href
                ? present(person).href.replace(/^\//, "")
                : "?people"),
          );
        } catch (_) {}
        if (typeof showSignIn === "function") showSignIn({ reason: "social" });
        else if (typeof signInGitHub === "function") signInGitHub();
        else byId("auth")?.click();
      };
      return;
    }
    if (person.id === me().id) {
      slot.innerHTML =
        '<p class="meta">This is you. Share your profile link so friends can follow.</p>';
      return;
    }
    try {
      const rows = await result(
        db
          .from("grinder_follows")
          .select("followed_id")
          .eq("follower_id", me().id)
          .eq("followed_id", person.id),
      );
      let active = rows.length > 0;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = active ? "Following · unfollow" : "Follow";
      button.setAttribute("aria-pressed", active ? "true" : "false");
      slot.append(button);
      button.onclick = async () => {
        button.disabled = true;
        try {
          if (active)
            await result(
              db
                .from("grinder_follows")
                .delete()
                .eq("follower_id", me().id)
                .eq("followed_id", person.id),
            );
          else
            await result(
              db
                .from("grinder_follows")
                .upsert(
                  { follower_id: me().id, followed_id: person.id },
                  {
                    onConflict: "follower_id,followed_id",
                    ignoreDuplicates: true,
                  },
                ),
            );
          active = !active;
          button.textContent = active ? "Following · unfollow" : "Follow";
          button.setAttribute("aria-pressed", active ? "true" : "false");
          status(active ? "Following. Their public runs will appear in Following." : "Unfollowed.");
        } catch (e) {
          fail(e);
        } finally {
          button.disabled = false;
          button.focus();
        }
      };
      const blocks = await result(
        db
          .from("grinder_blocks")
          .select("blocked_id")
          .eq("blocker_id", me().id)
          .eq("blocked_id", person.id),
      );
      let blocked = blocks.length > 0;
      const block = document.createElement("button");
      block.type = "button";
      block.className = "ghost";
      block.textContent = blocked ? "Unblock" : "Block";
      slot.append(block);
      block.onclick = async () => {
        block.disabled = true;
        try {
          if (blocked)
            await result(
              db
                .from("grinder_blocks")
                .delete()
                .eq("blocker_id", me().id)
                .eq("blocked_id", person.id),
            );
          else {
            if (active) {
              await result(
                db
                  .from("grinder_follows")
                  .delete()
                  .eq("follower_id", me().id)
                  .eq("followed_id", person.id),
              );
              active = false;
              button.textContent = "Follow";
              button.setAttribute("aria-pressed", "false");
            }
            await result(
              db
                .from("grinder_blocks")
                .insert({ blocker_id: me().id, blocked_id: person.id }),
            );
          }
          blocked = !blocked;
          block.textContent = blocked ? "Unblock" : "Block";
          status(
            blocked
              ? "Blocked interactions and signed-in feed visibility. Public pages remain readable when signed out."
              : "Unblocked.",
          );
        } catch (e) {
          fail(e);
        } finally {
          block.disabled = false;
          block.focus();
        }
      };
    } catch (e) {
      slot.textContent = "Following is temporarily unavailable.";
    }
  }

  async function closeFriends(slot) {
    if (!slot || !me()) return;
    const ownerId = me().id;
    async function paint(open = false) {
      try {
        const rows = await result(
          db
            .from("close_friends")
            .select(
              "friend_profile_id,created_at,friend:profiles!close_friends_friend_profile_id_fkey(id,github_handle,name,handle,display_name,avatar_url)",
            )
            .eq("owner_profile_id", ownerId)
            .order("created_at", { ascending: true }),
        );
        slot.innerHTML = `<details class="profile-settings close-friends-settings"${open ? " open" : ""}>
          <summary>Close friends</summary>
          <div class="panel pad">
            <p class="hint">Only you can see this list. People are not notified when you add or remove them.</p>
            <form class="reply-form close-friends-form">
              <label>Add by handle<input name="handle" required maxlength="40" placeholder="@friend"></label>
              <button>Add close friend</button>
            </form>
            <div class="close-friends-list">${
              rows.length
                ? rows
                    .map(
                      (row) =>
                        `<p>${link(row.friend)} <button type="button" class="ghost" data-remove-close-friend="${esc(row.friend_profile_id)}">Remove</button></p>`,
                    )
                    .join("")
                : "<p class=\"meta\">No close friends yet.</p>"
            }</div>
          </div>
        </details>`;
        slot
          .querySelectorAll("[data-remove-close-friend]")
          .forEach((button) => {
            button.onclick = async () => {
              button.disabled = true;
              try {
                await result(
                  db
                    .from("close_friends")
                    .delete()
                    .eq("owner_profile_id", ownerId)
                    .eq(
                      "friend_profile_id",
                      button.dataset.removeCloseFriend,
                    ),
                );
                status("Removed from Close friends.");
                await paint(true);
              } catch (error) {
                fail(error);
                button.disabled = false;
              }
            };
          });
        slot.querySelector("form").onsubmit = async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const button = form.querySelector("button");
          const handle = form.elements.handle.value.trim().replace(/^@+/, "");
          button.disabled = true;
          try {
            const people = await result(
              db.rpc("strava_profile_by_handle", { lookup: handle }),
            );
            const friend = people[0];
            if (!friend) {
              status("No profile has that handle.", true);
              return;
            }
            if (friend.id === ownerId) {
              status("Choose another profile.", true);
              return;
            }
            const inserted = await db.from("close_friends").insert({
              owner_profile_id: ownerId,
              friend_profile_id: friend.id,
            });
            if (inserted.error && inserted.error.code !== "23505")
              throw inserted.error;
            status(
              inserted.error
                ? "That profile is already a close friend."
                : "Added to Close friends.",
            );
            await paint(true);
          } catch (error) {
            fail(error);
          } finally {
            button.disabled = false;
          }
        };
      } catch (error) {
        slot.innerHTML =
          '<p class="meta">Close friends are temporarily unavailable.</p>';
        fail(error);
      }
    }
    await paint();
  }

  async function saveAgentVisibility(id, visibility) {
    if (visibility !== "private" && visibility !== "public") {
      throw new Error("Choose Private or Public.");
    }
    await result(
      db.from("grinder_agents").update({ visibility }).eq("id", id),
    );
  }

  function agentVisibilityForm(a) {
    const priv = a.visibility === "private" ? " selected" : "";
    const pub = a.visibility === "public" ? " selected" : "";
    return `<form class="reply-form agent-visibility" data-agent-visibility="${esc(a.id)}">
      <label>Profile visibility<select name="visibility">
        <option value="private"${priv}>Private</option>
        <option value="public"${pub}>Public</option>
      </select></label>
      <p class="hint">Public makes this agent profile discoverable. Run audiences stay unchanged.</p>
      <button type="submit">Save visibility</button>
    </form>`;
  }

  function wireAgentVisibility(reload) {
    document.querySelectorAll("[data-agent-visibility]").forEach((form) => {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const button = form.querySelector("button");
        if (button) button.disabled = true;
        try {
          await saveAgentVisibility(
            form.dataset.agentVisibility,
            form.elements.visibility.value,
          );
          status("Agent profile visibility saved. Run audiences did not change.");
          if (typeof reload === "function") await reload();
        } catch (error) {
          fail(error);
          if (button) button.disabled = false;
        }
      };
    });
  }

  async function attachAgentShareGate(runId) {
    const edit = byId("run-edit");
    if (!edit || edit.dataset.agentContext === "1" || !uuid(runId))
      return;
    edit.dataset.agentContext = "1";
    let actor = null;
    try {
      const runs = await result(
        db
          .from("runs")
          .select("id,source_actor_id,profile_id")
          .eq("id", runId)
          .limit(1),
      );
      const run = runs[0];
      if (!run || run.profile_id !== me()?.id || !run.source_actor_id) return;
      const actors = await result(
        db
          .from("grinder_agents")
          .select("id,name,visibility")
          .eq("id", run.source_actor_id)
          .limit(1),
      );
      actor = actors[0] || null;
    } catch (e) {
      fail(e);
      return;
    }
    if (!actor) return;
    if (actor.visibility !== "public" && !byId("run-agent-visibility")) {
      const notice = document.createElement("div");
      notice.id = "run-agent-visibility";
      notice.className = "account-notice";
      notice.innerHTML =
        `<p>This run is linked to <a href="/?agent=${encodeURIComponent(actor.id)}">${esc(actor.name || "an agent")}</a>, whose profile is private. You can still choose Followers, Close friends or Public for this captured run. Sharing the run does not publish the agent profile or change other runs.</p>`;
      const heading = edit.querySelector("h2");
      if (heading && heading.nextSibling)
        edit.insertBefore(notice, heading.nextSibling);
      else edit.prepend(notice);
    }
  }

  async function thread(runId, slot) {
    await attachAgentShareGate(runId);
    if (!slot || !uuid(runId)) return;
    const focusReply = replyTargetId();
    slot.innerHTML =
      responseReturnBar() +
      '<div class="head"><h2>Talk about this run</h2><span class="meta">ask about the work</span></div><div class="thread-items" aria-live="polite">Loading replies…</div>';
    const items = slot.querySelector(".thread-items");
    let cursor = null;
    let sawFocus = false;
    let focusKnownMissing = false;
    let focusedRow = null;
    // Resolve the deep-linked reply by id first. Page-1 absence is not deletion.
    if (focusReply) {
      try {
        const focused = await result(
          db
            .from("grinder_replies")
            .select(
              "*,author:profiles!grinder_replies_author_id_fkey(github_handle,name,handle,display_name,avatar_url)",
            )
            .eq("id", focusReply)
            .limit(1),
        );
        focusKnownMissing = !focused.length || focused[0].run_id !== runId;
        if (!focusKnownMissing) focusedRow = focused[0];
      } catch (_) {
        focusKnownMissing = false;
      }
    }
    function focusTarget() {
      const target = byId("reply-" + focusReply);
      if (!target) return;
      slot.querySelector(".reply-missing")?.remove();
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof target.focus === "function") {
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
        }
      });
    }
    function renderReply(reply) {
        const article = document.createElement("article");
        article.className = "card reply";
        article.id = "reply-" + reply.id;
        if (focusReply && reply.id === focusReply) {
          article.classList.add("reply-target");
          sawFocus = true;
        }
        article.innerHTML = `<div>${link(reply.author)} ${reply.source_actor_id ? `· <a href="/?agent=${reply.source_actor_id}">${esc(reply.agent_name || "Agent")}</a>` : ""} <small>${esc(new Date(reply.created_at).toLocaleString())}${reply.edited_at ? " · edited" : ""}</small></div><p class="reply-body">${esc(reply.body)}</p>${reply.evidence_ref ? `<small>About: ${esc(reply.evidence_ref)}</small>` : ""}`;
        if (me()?.id === reply.author_id) {
          const edit = document.createElement("button");
          edit.className = "ghost";
          edit.textContent = "Edit";
          edit.onclick = () => {
            const area = document.createElement("textarea");
            area.value = reply.body;
            area.maxLength = 3000;
            area.setAttribute("aria-label", "Edit your reply");
            const save = document.createElement("button");
            save.textContent = "Save";
            const cancel = document.createElement("button");
            cancel.className = "ghost";
            cancel.textContent = "Cancel";
            const form = document.createElement("div");
            form.append(area, save, cancel);
            article.append(form);
            edit.disabled = true;
            cancel.onclick = () => {
              form.remove();
              edit.disabled = false;
            };
            save.onclick = async () => {
              save.disabled = true;
              try {
                await result(
                  db
                    .from("grinder_replies")
                    .update({ body: area.value })
                    .eq("id", reply.id),
                );
                await thread(runId, slot);
              } catch (e) {
                fail(e);
                save.disabled = false;
              }
            };
          };
          const remove = document.createElement("button");
          remove.className = "ghost";
          remove.textContent = "Delete";
          remove.onclick = async () => {
            if (!confirm("Delete your reply?")) return;
            remove.disabled = true;
            try {
              await result(
                db.from("grinder_replies").delete().eq("id", reply.id),
              );
              article.remove();
            } catch (e) {
              fail(e);
              remove.disabled = false;
            }
          };
          article.append(edit, remove);
        }
        if (me() && me().id !== reply.author_id) {
          const report = document.createElement("button");
          report.className = "ghost";
          report.textContent = "Report";
          report.onclick = () => {
            if (article.querySelector(".report-form")) return;
            const form = document.createElement("form");
            form.className = "report-form reply-form";
            form.innerHTML =
              '<label>Reason<textarea name="reason" required maxlength="2000"></textarea></label><button>Submit report</button>';
            form.onsubmit = async (e) => {
              e.preventDefault();
              try {
                await result(
                  db
                    .from("grinder_reports")
                    .insert({
                      reporter_id: me().id,
                      run_id: runId,
                      reply_id: reply.id,
                      reason: form.elements.reason.value,
                    }),
                );
                form.replaceWith(
                  document.createTextNode(
                    "Report recorded. No response time is promised.",
                  ),
                );
              } catch (error) {
                fail(error);
              }
            };
            article.append(form);
          };
          article.append(report);
        }
        return article;
    }
    async function page() {
      let query = db
        .from("grinder_replies")
        .select(
          "*,author:profiles!grinder_replies_author_id_fkey(github_handle,name,handle,display_name,avatar_url)",
        )
        .eq("run_id", runId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(25);
      if (cursor)
        query = query.or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
        );
      const rows = await result(query);
      if (!cursor) items.innerHTML = "";
      for (const reply of rows) items.append(renderReply(reply));
      if (!rows.length && !cursor)
        items.innerHTML =
          "<p>No replies yet. Ask about the work or the setup.</p>";
      slot.querySelector(".older-replies")?.remove();
      if (rows.length === 25) {
        cursor = rows[rows.length - 1];
        const older = document.createElement("button");
        older.className = "older-replies ghost";
        older.textContent = "Earlier replies";
        older.onclick = async () => {
          try {
            await page();
            if (focusReply && sawFocus) focusTarget();
          } catch (e) {
            fail(e);
          }
        };
        slot.append(older);
      }
      return rows.length;
    }
    try {
      await page();
      // Keep paging until the known-existing deep link is on screen (R2-01). Past 12 pages (300
      // replies) the looked-up reply is rendered directly below instead of paging on.
      let pages = 0;
      while (focusReply && !focusKnownMissing && !sawFocus && pages < 12) {
        const older = slot.querySelector(".older-replies");
        if (!older) break;
        const before = cursor && cursor.id;
        const loaded = await page();
        pages += 1;
        if (!loaded || (cursor && cursor.id === before)) break; // backend did not advance: stop
      }
    } catch (e) {
      items.textContent = "Replies are temporarily unavailable.";
      fail(e);
      return;
    }
    slot.querySelector(".reply-missing")?.remove();
    slot.querySelector(".reply-direct")?.remove();
    if (focusReply && !sawFocus && focusedRow) {
      // The reply exists (looked up by id) but sits deeper than the pages loaded. Render the
      // target itself instead of calling unseen data removed.
      const direct = document.createElement("div");
      direct.className = "reply-direct";
      direct.innerHTML =
        "<p class=\"response-state\">This reply is further back than the thread has loaded, so it is shown here on its own. The replies below are newer.</p>" +
        responseReturnBar();
      const article = renderReply(focusedRow);
      article.classList.add("reply-target");
      direct.append(article);
      items.before(direct);
      sawFocus = true;
      focusTarget();
    } else if (focusReply && (focusKnownMissing || !sawFocus)) {
      const missing = document.createElement("div");
      missing.className = "card reply-missing";
      missing.innerHTML =
        "<p>That reply was removed or is not visible to you. The run is still here.</p>" +
        responseReturnBar();
      items.before(missing);
    } else if (focusReply && sawFocus) {
      focusTarget();
    }
    if (me()) {
      const form = document.createElement("form");
      form.className = "reply-form";
      form.innerHTML =
        '<label>Your reply<textarea name="body" required maxlength="3000" placeholder="Ask about the build or respond to the work."></textarea></label><label>Part of the run you mean (optional)<input name="evidence" maxlength="200"></label><button>Post reply</button>';
      form.onsubmit = async (e) => {
        e.preventDefault();
        const button = form.querySelector("button");
        button.disabled = true;
        try {
          await result(
            db
              .from("grinder_replies")
              .insert({
                run_id: runId,
                author_id: me().id,
                body: form.elements.body.value,
                evidence_ref: form.elements.evidence.value || null,
              }),
          );
          status(
            peekResponseReturn() === "?inbox"
              ? "Reply posted. Return to Notifications when you are ready."
              : "Reply posted.",
          );
          await thread(runId, slot);
        } catch (error) {
          fail(error);
          button.disabled = false;
        }
      };
      slot.append(form);
    } else {
      const note = document.createElement("p");
      note.textContent = "Sign in to reply.";
      slot.append(note);
    }
  }

  async function inbox() {
    start(
      "Notifications",
      "Open the exact conversation, then come back here. Unread stays unread until you actually see it.",
      "inbox",
    );
    if (!signedIn()) return;
    resetUnreadMarks(me()?.id);
    clearResponseReturn();
    const body = byId("social-body");
    const filter =
      new URLSearchParams(location.search).get("filter") === "unread"
        ? "unread"
        : "all";
    try {
      const rows = await result(
        db
          .from("grinder_notifications")
          .select(
            "*,actor:profiles!grinder_notifications_actor_id_fkey(github_handle,name,handle,display_name,avatar_url)",
          )
          .eq("recipient_id", me().id)
          .order("created_at", { ascending: false })
          .limit(50),
      );
      const { runs, replies } = await resolveNotificationTargets(rows);
      const unreadCount = rows.filter((n) => !n.read_at).length;
      const visible = rows.filter((n) =>
        filter === "unread" ? !n.read_at : true,
      );

      const filters = `<nav class="response-filters" aria-label="Response filters">
        <a href="/?inbox" class="${filter === "all" ? "on" : ""}" ${filter === "all" ? 'aria-current="page"' : ""}>All</a>
        <a href="/?inbox&filter=unread" class="${filter === "unread" ? "on" : ""}" ${filter === "unread" ? 'aria-current="page"' : ""}>Unread${unreadCount ? ` · ${unreadCount}` : ""}</a>
      </nav>`;

      if (!rows.length) {
        body.innerHTML =
          filters +
          empty(
            "Post a real run and share it with a friend. Their thanks and replies will bring you back to the conversation.",
            `<div class="cta"><a class="act blue" href="/?post">Post your first run</a><a class="act" href="/?people">Find people</a></div>`,
          );
        await refreshUnread();
        return;
      }

      if (!visible.length) {
        body.innerHTML =
          filters +
          empty(
            "No unread notifications. Open All to browse earlier thanks and replies.",
            `<div class="cta"><a class="act" href="/?inbox">Show all responses</a></div>`,
          );
        await refreshUnread();
        return;
      }

      body.innerHTML =
        filters +
        `<p class="response-summary meta">${unreadCount ? `${unreadCount} unread · ` : ""}${rows.length} recent</p>` +
        visible
          .map((n) => {
            const actor = present(n.actor);
            const kind =
              n.kind === "reply"
                ? "replied to your run"
                : n.kind === "ack"
                  ? "thanked your work"
                  : "followed you";
            const run = n.run_id ? runs.get(n.run_id) : null;
            const reply =
              n.kind === "reply" && n.source_id
                ? replies.get(n.source_id)
                : null;
            const runGone = Boolean(n.run_id) && !run;
            const replyGone =
              n.kind === "reply" && uuid(n.source_id) && !reply;
            const href =
              runGone || replyGone
                ? null
                : notificationHref({
                    ...n,
                    actor: n.actor,
                  });
            let stateNote = "";
            if (runGone) {
              stateNote =
                "<p class=\"response-state\">This run was deleted or is no longer available.</p>";
            } else if (replyGone) {
              stateNote =
                "<p class=\"response-state\">That reply was removed. The run may still be open.</p>";
            } else if (!actor.id && !actor.href) {
              stateNote =
                "<p class=\"response-state\">This builder is unavailable (blocked, private or removed).</p>";
            }
            const openLabel =
              n.kind === "reply"
                ? "Open exact reply"
                : n.kind === "ack"
                  ? "Open the run"
                  : "Open profile";
            const returnLinks = [
              n.kind !== "follow" && !runGone && !replyGone && actor.href
                ? `<a href="${actor.href}" data-response-nav="1">Open profile</a>`
                : null,
              href
                ? `<a href="${href}" data-response-nav="1" data-notification-id="${esc(n.id)}">${openLabel}</a>`
                : runGone
                  ? null
                  : replyGone && n.run_id
                    ? `<a href="/?run=${encodeURIComponent(n.run_id)}#grind-thread" data-response-nav="1" data-notification-id="${esc(n.id)}">Open the run</a>`
                    : null,
              n.kind === "follow" && !runGone
                ? `<a href="/?following" data-response-nav="1">Open Following</a>`
                : null,
            ]
              .filter(Boolean)
              .join('<span class="response-sep" aria-hidden="true">·</span>');
            const actorHtml = actor.id || actor.href ? link(n.actor) : "Someone";
            return `<article class="card response-item${!n.read_at ? " unread" : " read"}" data-notification-id="${esc(n.id)}" data-read="${n.read_at ? "1" : "0"}">
              <div class="response-item-top">
                <p class="response-item-copy">${actorHtml} ${kind}${!n.read_at ? ' <span class="response-new">New</span>' : ""}</p>
                <small>${esc(new Date(n.created_at).toLocaleString())}</small>
              </div>
              ${stateNote}
              <p class="response-item-actions">${returnLinks || "<span class=\"meta\">Nothing to open</span>"}</p>
            </article>`;
          })
          .join("") +
        `<section class="run-primary-actions response-next"><p><b>Ready for the next real run?</b></p><p class="hint">Respond first, then capture a genuinely new sitting. No streak required.</p><div class="cta"><a class="act blue" href="/?post">Post your next run</a></div></section>`;

      body.querySelectorAll("[data-response-nav]").forEach((anchor) => {
        anchor.addEventListener("click", () => {
          stashResponseReturn();
          const id = anchor.getAttribute("data-notification-id");
          if (id) markNotificationsRead([id]);
        });
      });

      // Mark as read only what actually enters the viewport, not the whole inbox.
      if (inboxObserver) {
        inboxObserver.disconnect();
        inboxObserver = null;
      }
      if (typeof IntersectionObserver === "function") {
        inboxObserver = new IntersectionObserver(
          (entries) => {
            const seen = [];
            for (const entry of entries) {
              if (!entry.isIntersecting || entry.intersectionRatio < 0.55)
                continue;
              const el = entry.target;
              if (el.getAttribute("data-read") === "1") {
                inboxObserver.unobserve(el);
                continue;
              }
              const id = el.getAttribute("data-notification-id");
              if (!id) continue;
              el.setAttribute("data-read", "1");
              el.classList.remove("unread");
              el.classList.add("read");
              el.querySelector(".response-new")?.remove();
              seen.push(id);
              inboxObserver.unobserve(el);
            }
            if (seen.length) markNotificationsRead(seen);
          },
          { threshold: [0.55] },
        );
        body
          .querySelectorAll('.response-item[data-read="0"]')
          .forEach((el) => inboxObserver.observe(el));
      }

      await refreshUnread();
    } catch (e) {
      body.innerHTML = empty("Your inbox could not load. Try again.");
      fail(e);
    }
  }

  async function shareControl(run, slot) {
    if (!slot || !me() || run.profile_id !== me().id) return;
    try {
      const memberships = await result(
        db
          .from("grinder_memberships")
          .select("crew:grinder_crews(id,name)")
          .eq("profile_id", me().id),
      );
      const choices = memberships.map((m) => m.crew).filter(Boolean);
      if (!choices.length) {
        slot.innerHTML =
          '<a href="/?crews">Create or join a club to share this run with its members.</a>';
        return;
      }
      slot.innerHTML = `<form class="panel" id="share-crew-form"><label>Share with a club<select name="crew">${choices.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label><label>Audience<select name="audience"><option value="crew">Club members only · removes public access</option><option value="public">Public and this club</option></select></label><button>Share run with club</button></form>`;
      slot.querySelector("form").onsubmit = async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        form.querySelector("button").disabled = true;
        try {
          await result(
            db.rpc("grinder_share_with_crew", {
              grind: run.id,
              crew: form.elements.crew.value,
              keep_public: form.elements.audience.value === "public",
            }),
          );
          status("Shared with your Crew.");
          location.reload();
        } catch (error) {
          fail(error);
          form.querySelector("button").disabled = false;
        }
      };
    } catch (e) {
      slot.textContent = "Crew sharing is temporarily unavailable.";
    }
  }

  async function crews() {
    start(
      "Crews",
      "A Crew is two builders who each post a real run and see each other here. Empty pages are not a club.",
      "crews",
    );
    if (!signedIn()) return;
    try {
      const memberships = await result(
        db
          .from("grinder_memberships")
          .select("crew:grinder_crews(id,name,description,visibility)")
          .eq("profile_id", me().id),
      );
      const rows = memberships.map((m) => m.crew).filter(Boolean);
      byId("social-body").innerHTML =
        (rows.length
          ? rows
              .map(
                (c) =>
                  `<article class="card"><h3><a href="/?crew=${c.id}">${esc(c.name)}</a></h3><p>${esc(c.description)}</p><small>${esc(c.visibility)} Crew</small></article>`,
              )
              .join("")
          : empty(
              "Invite one friend. The club starts when both of you have posted a real run into the same Crew feed.",
              `<div class="cta"><a class="act" href="/?people">Find people</a></div>`,
            )) +
        '<form id="create-crew" class="panel"><label>Crew name<input name="name" required maxlength="80" placeholder="Oscar and Eric"></label><label>Who can see the Crew?<select name="visibility"><option value="private">Members only</option><option value="public">Public</option></select></label><p class="hint">Primary launch is Oscar and Eric\'s two-person return loop, not a directory of empty clubs.</p><button>Start a two-person Crew</button></form>';
      byId("create-crew").onsubmit = async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        form.querySelector("button").disabled = true;
        try {
          const id = await result(
            db.rpc("grinder_create_crew", {
              crew_name: form.elements.name.value,
              crew_visibility: form.elements.visibility.value,
            }),
          );
          location.href = "/?crew=" + encodeURIComponent(id);
        } catch (error) {
          fail(error);
          form.querySelector("button").disabled = false;
        }
      };
    } catch (e) {
      byId("social-body").innerHTML = empty("Crews could not load. Try again.");
      fail(e);
    }
  }

  async function crew(id) {
    start("Club", "Runs shared by the people in this club.", "crews");
    if (!uuid(id)) {
      byId("social-body").innerHTML = empty("This Crew link is invalid.");
      return;
    }
    try {
      const rows = await result(
        db.from("grinder_crews").select("*").eq("id", id),
      );
      const c = rows[0];
      if (!c) {
        byId("social-body").innerHTML = empty(
          "This Crew is private or unavailable.",
        );
        return;
      }
      const members = await result(
        db
          .from("grinder_memberships")
          .select("profile_id,role,profile:profiles(github_handle,name,handle,display_name,avatar_url)")
          .eq("crew_id", id),
      );
      const mine = members.some((m) => m.profile_id === me()?.id),
        owner = c.owner_id === me()?.id;
      const runs = await result(
        db
          .from("runs")
          .select("*,profiles!runs_profile_id_fkey(github_handle,name,rig,handle,display_name,avatar_url)")
          .eq("crew_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
      );
      const posters = new Set((runs || []).map((r) => r.profile_id).filter(Boolean));
      let loopNote = "";
      if (members.length < 2) {
        loopNote =
          '<p class="hint">Invite one person. A Crew becomes real when two builders each have a run in this feed.</p>';
      } else if (members.length === 2 && posters.size >= 2) {
        loopNote =
          '<p class="hint">Two builders, real runs. Thank a specific contribution, then return through Notifications.</p>';
      } else if (members.length === 2 && posters.size === 1) {
        const missing = members.find((m) => !posters.has(m.profile_id));
        const label = missing ? present(missing.profile).label : "the other member";
        loopNote = `<p class="hint">Waiting for ${esc(label)} to share a real run into this Crew.</p>`;
      } else if (!runs.length) {
        loopNote =
          '<p class="hint">No shared runs yet. Each member posts one real run to this Crew.</p>';
      }
      byId("social-body").innerHTML =
        `<div class="card"><h2>${esc(c.name)}</h2><p>${esc(c.description)}</p><small>${esc(c.visibility)} · ${members.length} members</small><p>${members.map((m) => link(m.profile) + (m.role === "owner" ? " · owner" : "")).join(" · ")}</p>${loopNote}${owner ? '<button id="invite-crew">Invite one person</button><div id="crew-invite"></div>' : mine ? '<button id="leave-crew" class="ghost">Leave Crew</button>' : ""}</div><div class="head"><h2>Crew feed</h2><span class="meta">${runs.length || "none yet"}</span></div>` +
        (runs.length
          ? await renderRuns(runs)
          : empty(
              members.length < 2
                ? "Invite one friend, then each of you post a real run here."
                : "No runs shared with this club yet.",
            ));
      // A public club can be joined by anyone signed in, for themselves only (migration 014).
      if (!mine && c.visibility === "public") {
        const join = document.createElement("button");
        join.type = "button"; join.className = "act primary"; join.id = "club-join";
        join.textContent = me() ? "Join this club" : "Sign in to join";
        byId("social-body").prepend(join);
        join.onclick = async () => {
          if (!me()) { if (typeof showSignIn === "function") showSignIn({ reason: "social" }); return; }
          join.disabled = true; join.setAttribute("aria-busy", "true");
          try { await result(db.rpc("grinder_join_public_crew", { crew: id })); await crew(id); }
          catch (e) { join.disabled = false; join.removeAttribute("aria-busy"); fail(e); }
        };
      }
      if (owner)
        byId("invite-crew").onclick = async () => {
          try {
            const token = await result(db.rpc("grinder_invite", { crew: id }));
            const url = location.origin + "/?join=" + encodeURIComponent(token);
            byId("crew-invite").innerHTML =
              '<label>Invite link · expires in seven days<input readonly value="' +
              esc(url) +
              '"></label><p>Share this link with one person. It can be used once.</p>';
            byId("crew-invite").querySelector("input").select();
          } catch (e) {
            fail(e);
          }
        };
      if (owner) {
        const panel = document.createElement("section");
        panel.className = "panel reply-form";
        panel.innerHTML =
          "<h3>Crew ownership and members</h3><p>Transfer Crew and hosted Challenges before leaving a shared Crew.</p>" +
          members
            .filter((m) => m.profile_id !== me().id)
            .map(
              (m) =>
                `<div>${link(m.profile)} <button class="ghost" data-remove-member="${m.profile_id}">Remove</button> <button class="ghost" data-transfer-member="${m.profile_id}">Make owner</button></div>`,
            )
            .join("") +
          '<button id="show-invites" class="ghost">Manage invitations</button><div id="invite-list"></div>';
        byId("social-body").append(panel);
        panel.querySelectorAll("[data-remove-member]").forEach(
          (b) =>
            (b.onclick = async () => {
              if (!confirm("Remove this member from the Crew?")) return;
              try {
                await result(
                  db.rpc("grinder_remove_member", {
                    crew: id,
                    member: b.dataset.removeMember,
                  }),
                );
                await crew(id);
              } catch (e) {
                fail(e);
              }
            }),
        );
        panel.querySelectorAll("[data-transfer-member]").forEach(
          (b) =>
            (b.onclick = async () => {
              if (
                !confirm(
                  "Transfer Crew and hosted Challenges to this member? They will control membership and invitations.",
                )
              )
                return;
              try {
                await result(
                  db.rpc("grinder_transfer_crew", {
                    crew: id,
                    new_owner: b.dataset.transferMember,
                  }),
                );
                await crew(id);
              } catch (e) {
                fail(e);
              }
            }),
        );
        byId("show-invites").onclick = async () => {
          try {
            const invitations = await result(
              db
                .from("grinder_invites")
                .select("id,expires_at,revoked,accepted_by")
                .eq("crew_id", id)
                .order("created_at", { ascending: false })
                .limit(50),
            );
            byId("invite-list").innerHTML =
              invitations
                .map(
                  (i) =>
                    `<p>${i.accepted_by ? "Used" : i.revoked ? "Revoked" : "Expires " + esc(new Date(i.expires_at).toLocaleString())}${!i.accepted_by && !i.revoked ? ` <button class="ghost" data-revoke-invite="${i.id}">Revoke</button>` : ""}</p>`,
                )
                .join("") || "No invitations yet.";
            byId("invite-list")
              .querySelectorAll("[data-revoke-invite]")
              .forEach(
                (b) =>
                  (b.onclick = async () => {
                    try {
                      await result(
                        db
                          .from("grinder_invites")
                          .update({ revoked: true })
                          .eq("id", b.dataset.revokeInvite),
                      );
                      b.replaceWith(document.createTextNode("Revoked"));
                    } catch (e) {
                      fail(e);
                    }
                  }),
              );
          } catch (e) {
            fail(e);
          }
        };
      }
      if (mine && !owner)
        byId("leave-crew").onclick = async () => {
          if (!confirm("Leave this Crew?")) return;
          try {
            await result(
              db.rpc("grinder_remove_member", { crew: id, member: me().id }),
            );
            location.href = "/?crews";
          } catch (e) {
            fail(e);
          }
        };
    } catch (e) {
      byId("social-body").innerHTML = empty("This Crew could not load.");
      fail(e);
    }
  }

  async function join(token) {
    start(
      "Join a Crew",
      "An invitation gives you access to this Crew’s shared work.",
    );
    if (!signedIn()) return;
    byId("social-body").innerHTML =
      '<button id="join-crew">Accept invitation</button>';
    byId("join-crew").onclick = async () => {
      byId("join-crew").disabled = true;
      try {
        const id = await result(db.rpc("grinder_join_crew", { token }));
        location.href = "/?crew=" + encodeURIComponent(id);
      } catch (e) {
        fail(e);
        byId("join-crew").disabled = false;
      }
    };
  }

  async function agents(opts = {}) {
    start(
      "Your agents",
      "Give each contributor an identity and only the access it needs. Private automatic upload uses Connect.",
    );
    if (!signedIn()) return;
    try {
      const actors = await result(
        db
          .from("grinder_agents")
          .select("*")
          .eq("owner_id", me().id)
          .order("created_at"),
      );
      byId("social-body").innerHTML =
        actors
          .map(
            (a) =>
              `<article class="card"><h3><a href="/?agent=${a.id}">${esc(a.name)}</a></h3><p>Agent · ${esc(a.visibility)}</p>${agentVisibilityForm(a)}<button data-grant="${a.id}">Manage access</button><div id="access-${a.id}"></div></article>`,
          )
          .join("") +
        '<form id="create-agent" class="panel reply-form"><label>Agent name<input name="name" required maxlength="80" placeholder="Grok Bot"></label><label>Profile visibility<select name="visibility"><option value="private" selected>Private</option><option value="public">Public</option></select></label><button>Create agent profile</button></form>';
      byId("create-agent").onsubmit = async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        form.querySelector("button").disabled = true;
        try {
          await result(
            db
              .from("grinder_agents")
              .insert({
                owner_id: me().id,
                name: form.elements.name.value,
                visibility: form.elements.visibility.value,
              }),
          );
          await agents(opts);
        } catch (error) {
          fail(error);
          form.querySelector("button").disabled = false;
        }
      };
      wireAgentVisibility(() => agents(opts));
      document
        .querySelectorAll("[data-grant]")
        .forEach(
          (button) => (button.onclick = () => access(button.dataset.grant)),
        );
    } catch (e) {
      byId("social-body").innerHTML = empty("Agent profiles could not load.");
      fail(e);
    }
  }

  async function access(id) {
    const slot = byId("access-" + id);
    if (!slot) return;
    try {
      const tokens = await result(
        db
          .from("grinder_agent_tokens")
          .select("id,agent_id,scopes,audiences,expires_at,revoked,created_at")
          .eq("agent_id", id),
      );
      slot.innerHTML =
        tokens
          .map(
            (t) =>
              `<div class="card"><p>${esc(t.scopes.join(", "))} · ${esc(t.audiences.join(", "))}</p><small>Expires ${esc(new Date(t.expires_at).toLocaleString())}</small>${t.revoked ? "<p>Revoked</p>" : `<button data-revoke="${t.id}" class="ghost">Revoke access</button>`}</div>`,
          )
          .join("") +
        '<form class="reply-form grant-form"><fieldset><legend>Permitted actions</legend>' +
        ["draft", "publish", "reply", "ack"]
          .map(
            (s) =>
              `<label><input type="checkbox" name="scope" value="${s}" ${s === "draft" || s === "publish" ? "checked" : ""}> ${s}</label>`,
          )
          .join("") +
        '</fieldset><fieldset><legend>Permitted audiences</legend><label><input type="checkbox" name="audience" value="private" checked> Only me (private)</label><label><input type="checkbox" name="audience" value="public"> Public · authorises outward actions without another click</label></fieldset><label>Expires in<select name="days"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option></select></label><p>Up to 60 actions per hour. You can revoke access at any time. Leave Public unchecked unless you mean it.</p><button>Grant selected access</button></form><div class="issued-token"></div>';
      slot.querySelectorAll("[data-revoke]").forEach(
        (button) =>
          (button.onclick = async () => {
            button.disabled = true;
            try {
              await result(
                db
                  .from("grinder_agent_tokens")
                  .update({ revoked: true })
                  .eq("id", button.dataset.revoke),
              );
              await access(id);
            } catch (e) {
              fail(e);
              button.disabled = false;
            }
          }),
      );
      slot.querySelector("form").onsubmit = async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const scopes = [...form.querySelectorAll("[name=scope]:checked")].map(
          (i) => i.value,
        );
        const audiences = [
          ...form.querySelectorAll("[name=audience]:checked"),
        ].map((i) => i.value);
        if (!scopes.length || !audiences.length) {
          status("Choose at least one action and audience.", true);
          return;
        }
        form.querySelector("button").disabled = true;
        try {
          const issued = await result(
            db.rpc("grinder_issue_agent_token", {
              agent: id,
              allowed_scopes: scopes,
              allowed_audiences: audiences,
              expires: new Date(
                Date.now() + Number(form.elements.days.value) * 86400000,
              ).toISOString(),
            }),
          );
          const shown = slot.querySelector(".issued-token");
          const paste = [
            "# STRIVE agent credential (shown once)",
            "export AGENTGRINDER_AGENT_TOKEN='" + issued.token + "'",
            "# Kit or agent calls grinder_agent_action with this token.",
            "# Default audience is Only me unless Public was checked above.",
            "# After upload: open /?explore (Latest runs) or /?mine",
          ].join("\n");
          shown.innerHTML =
            '<p>Save this credential now. It is shown only here and is not saved in this browser.</p><input type="password" readonly aria-label="Agent credential"><div class="account-actions"><button type="button" class="act blue" data-copy-token>Copy credential</button><button type="button" class="act" data-copy-paste>Copy one-paste setup</button></div><label>One-paste for your agent<textarea readonly rows="6" aria-label="One-paste setup"></textarea></label><p class="account-hint">Give it to your agent as AGENTGRINDER_AGENT_TOKEN. Do not put it in a prompt or public Rig. Claude preserves ridge on publish.</p>';
          shown.querySelector("input").value = issued.token;
          shown.querySelector("textarea").value = paste;
          shown.querySelector("[data-copy-token]").onclick = async () => {
            try {
              await navigator.clipboard.writeText(issued.token);
              status("Credential copied.");
            } catch {
              status("Copy from the credential field.", true);
            }
          };
          shown.querySelector("[data-copy-paste]").onclick = async () => {
            try {
              await navigator.clipboard.writeText(paste);
              status("One-paste setup copied.");
            } catch {
              status("Copy from the setup field.", true);
            }
          };
        } catch (error) {
          fail(error);
        } finally {
          form.querySelector("button").disabled = false;
        }
      };
    } catch (e) {
      fail(e);
      slot.textContent = "Access controls could not load.";
    }
  }

  async function agentProfile(id) {
    start(
      "Agent",
      "A contributor with a human owner and explicit permissions.",
    );
    if (!uuid(id)) {
      byId("social-body").innerHTML = empty("Invalid agent link.");
      return;
    }
    try {
      const actors = await result(
        db
          .from("grinder_agents")
          .select(
            "*,owner:profiles!grinder_agents_owner_id_fkey(github_handle,name,handle,display_name,avatar_url)",
          )
          .eq("id", id),
      );
      const actor = actors[0];
      if (!actor) {
        byId("social-body").innerHTML = empty(
          "This agent is private or unavailable.",
        );
        return;
      }
      const runs = await result(
        db
          .from("runs")
          .select("*,profiles!runs_profile_id_fkey(github_handle,name,rig,handle,display_name,avatar_url)")
          .eq("source_actor_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
      );
      const mine =
        me()?.id === actor.owner_id || me()?.id === actor.owner?.id;
      byId("social-body").innerHTML =
        `<article class="card"><h2>${esc(actor.name)}</h2><p>Agent · owned by ${link(actor.owner)}</p><p>Contributions below were posted with access granted by its owner. Identity does not independently verify an outcome.</p>${mine ? agentVisibilityForm(actor) : ""}</article>` +
        (runs.length
          ? await renderRuns(runs)
          : empty("No visible runs from this agent yet."));
      if (mine) wireAgentVisibility(() => agentProfile(id));
    } catch (e) {
      fail(e);
      byId("social-body").innerHTML = empty("This agent could not load.");
    }
  }
  async function askControl(run, slot) {
    if (!slot || !me() || !run.source_actor_id || run.visibility !== "public")
      return;
    const form = document.createElement("form");
    form.className = "reply-form panel";
    form.innerHTML =
      '<h3>Ask this agent about the run</h3><label>Your question<textarea name="question" required maxlength="2000"></textarea></label><p>The connected agent receives public counts and revision references. Raw test output and private transcripts are not included. It replies when its owner runs the integration.</p><button>Queue question</button>';
    form.onsubmit = async (e) => {
      e.preventDefault();
      form.querySelector("button").disabled = true;
      try {
        await result(
          db.rpc("grinder_ask_agent", {
            agent: run.source_actor_id,
            grind: run.id,
            question_text: form.elements.question.value,
          }),
        );
        form.replaceWith(
          document.createTextNode(
            "Question queued. A permitted response will appear in this thread.",
          ),
        );
      } catch (error) {
        fail(error);
        form.querySelector("button").disabled = false;
      }
    };
    slot.append(form);
  }
  async function scrapbook(person, slot) {
    if (!slot) return;
    try {
      const agents = await result(
        db
          .from("grinder_agents")
          .select("id,name,visibility")
          .eq("owner_id", person.id)
          .order("created_at", { ascending: false })
          .limit(20),
      );
      const rigs = await result(
        db
          .from("grinder_rig_revisions")
          .select("id,label,visibility")
          .eq("owner_id", person.id)
          .order("created_at", { ascending: false })
          .limit(6),
      );
      let featured = "";
      if (person.featured_run_id) {
        const runs = await result(
          db
            .from("runs")
            .select("*,profiles!runs_profile_id_fkey(github_handle,name,rig,handle,display_name,avatar_url)")
            .eq("id", person.featured_run_id)
            .eq("profile_id", person.id)
            .eq("visibility", "public"),
        );
        if (runs.length)
          featured =
            '<div class="head"><h2>Selected run</h2></div>' +
            (await renderRuns(runs));
      }
      slot.innerHTML =
        featured +
        (agents.length
          ? '<div class="panel"><h3>Agents</h3>' +
            agents
              .map(
                (a) =>
                  `<p><a href="/?agent=${a.id}">${esc(a.name)}</a>${a.visibility === "private" ? " · only you" : ""}</p>`,
              )
              .join("") +
            "</div>"
          : "") +
        (rigs.length
          ? '<div class="panel"><h3>Rig versions</h3>' +
            rigs
              .map(
                (r) =>
                  `<p><a href="/?rigversion=${r.id}">${esc(r.label)}</a>${r.visibility === "private" ? " · only you" : ""}</p>`,
              )
              .join("") +
            "</div>"
          : "");
    } catch (e) {
      slot.textContent = "Agent and Rig details are temporarily unavailable.";
    }
  }
  async function featureControl(run, slot) {
    if (
      !slot ||
      !me() ||
      run.profile_id !== me().id ||
      run.visibility !== "public"
    )
      return;
    const button = document.createElement("button");
    button.textContent = "Feature in my Scrapbook";
    button.onclick = async () => {
      try {
        await result(db.rpc("grinder_feature_run", { grind: run.id }));
        status("Run saved to your profile.");
      } catch (e) {
        fail(e);
      }
    };
    slot.append(button);
  }
  return {
    scrapbook,
    featureControl,
    askControl,
    following,
    followControl,
    isSocialReturn,
    applyStoredSocialReturn,
    closeFriends,
    thread,
    inbox,
    refreshUnread,
    notificationsPanel,
    markAllNotificationsRead,
    crews,
    crew,
    join,
    shareControl,
    agents,
    agentProfile,
  };
};
