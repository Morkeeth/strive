/* Connect: one-step private upload grant via thin 007 wrappers.
 * agent_token_create({ p_label }) -> object with plaintext once
 * agent_token_list() -> JSON array (never full secret)
 * agent_token_revoke({ p_id }) -> true
 * Advanced Agents (/?agents) stays separate for other scopes/audiences.
 */
window.GrinderConnect = function ({ db, me, app, frame, status, signInGitHub, signIn }) {
  const esc = (x) =>
    String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const byId = (id) => document.getElementById(id);
  const mount = () => (typeof app === "function" ? app() : app) || byId("app");
  const say = (m, bad) => {
    if (typeof status === "function") status(m, bad);
  };
  const origin = () => (typeof location !== "undefined" ? location.origin : "https://agentic-strava.vercel.app");

  function pasteBlock(token) {
    const url = origin() + "/api/agent/runs";
    return [
      "# STRIVE private agent upload",
      "export STRIVE_AGENT_TOKEN='" + token + "'",
      "curl -sS -X POST '" + url + "' \\",
      "  -H \"Authorization: Bearer $STRIVE_AGENT_TOKEN\" \\",
      "  -H 'Content-Type: application/json' \\",
      "  -d @run.json",
      "",
      "# Metrics only. Default audience is Only me. After upload open /?mine (My runs). Choose Public to add it to the feed.",
    ].join("\n");
  }

  function unavailableHtml(detail) {
    return `<section class="card pad connect" id="connect-body">
      <h1>Connect an agent</h1>
      <p>Private upload tokens are not available on this deployment yet. Preview capture still works.</p>
      <p class="account-hint">${esc(detail || "Waiting on agent_token_create / list / revoke.")}</p>
      <div class="account-actions">
        <a class="act blue" href="/?post">Preview a run</a>
        <a class="act" href="/?mine">My runs</a>
        <a class="act" href="/?agents">Advanced Agents</a>
      </div>
    </section>`;
  }

  function signedOutHtml() {
    return `<section class="card pad connect" id="connect-body">
      <h1>Connect an agent</h1>
      <p>Sign in with GitHub, name the agent, get one private upload credential. Private uploads appear in My runs. Choose Public to add one to the feed.</p>
      <div class="account-actions"><button type="button" class="act blue" id="connect-signin">Sign in with GitHub</button>
      <a class="act" href="/?mine">See my runs</a></div>
      <p class="account-hint">Signing in never posts a run. Connect tokens stay Only me.</p>
    </section>`;
  }

  function listHtml(rows) {
    if (!rows.length) {
      return `<p class="account-hint">No connected agents yet. Name one below.</p>`;
    }
    return `<ul class="connect-tokens" aria-label="Connected agents">${rows
      .map((row) => {
        const revoked = row.revoked === true;
        const label = row.label || "Connected agent";
        const prefix = row.token_prefix || "********";
        const exp = row.expires_at ? new Date(row.expires_at).toLocaleDateString() : "";
        return `<li class="connect-token${revoked ? " is-revoked" : ""}">
          <div><strong>${esc(label)}</strong>
            <span class="account-hint">${esc(prefix)}…${revoked ? " · revoked" : exp ? " · expires " + esc(exp) : ""}</span>
          </div>
          ${revoked ? "" : `<button type="button" class="act" data-revoke="${esc(row.id)}">Revoke</button>`}
        </li>`;
      })
      .join("")}</ul>`;
  }

  function agentVisibilityHtml(agent) {
    if (!agent) return "";
    const isPublic = agent.visibility === "public";
    return `<section class="card pad account-section" id="connect-agent-visibility">
        <h2>Agent profile</h2>
        <p>Uploads stay linked to this Connect agent. A captured run can use Only me, Close friends, Followers or Public while the agent profile stays private. Agent profile visibility controls whether people can discover the agent; it does not change any run audience.</p>
        <p class="account-hint">Now: ${isPublic ? "Public" : "Private"}.</p>
        ${isPublic ? "" : `<div class="account-actions"><button type="button" class="act blue" id="connect-make-public">Make Connect agent public</button></div>`}
        <p id="connect-agent-state" class="account-state" role="status" aria-live="polite"></p>
      </section>`;
  }

  function panelHtml(rows, issued, agent) {
    const once = issued
      ? `<section class="connect-once" role="status" aria-live="polite">
          <h2>Save this credential now</h2>
          <p>Shown once. Not stored in this browser. Private upload only.</p>
          <label for="connect-token-value">Token</label>
          <input id="connect-token-value" type="password" readonly value="${esc(issued.token)}">
          <div class="account-actions">
            <button type="button" class="act blue" id="connect-copy-token">Copy token</button>
            <button type="button" class="act" id="connect-copy-paste">Copy one-paste setup</button>
          </div>
          <label for="connect-paste">One-paste for your agent</label>
          <textarea id="connect-paste" readonly rows="9">${esc(pasteBlock(issued.token))}</textarea>
        </section>`
      : "";
    return `<div class="connect" id="connect-body">
      <section class="card pad account-section">
        <h1>Connect an agent</h1>
        <p class="account-lead">One step: name it, connect, paste the credential once. Private uploads appear in <a href="/?mine">My runs</a>. Choose Public when you want a run on the feed.</p>
        <form id="connect-create" class="account-form" novalidate>
          <label for="connect-label">Agent name</label>
          <input id="connect-label" name="label" maxlength="80" required placeholder="Grok laptop" autocomplete="off">
          <p class="account-hint">Private draft and publish for 30 days. Other audiences stay on <a href="/?agents">Advanced Agents</a>.</p>
          <p id="connect-create-state" class="account-state" role="status" aria-live="polite"></p>
          <div class="account-actions"><button type="submit" class="act blue" id="connect-create-go">Connect</button></div>
        </form>
        ${once}
      </section>
      ${agentVisibilityHtml(agent || null)}
      <section class="card pad account-section" aria-labelledby="connect-list-title">
        <h2 id="connect-list-title">Your connections</h2>
        <div id="connect-list">${listHtml(rows)}</div>
        <p id="connect-list-state" class="account-state" role="status" aria-live="polite"></p>
      </section>
      <section class="card pad account-section">
        <h2>Next</h2>
        <div class="account-actions">
          <a class="act blue" href="/?mine">See my runs</a>
          <a class="act" href="/">Feed</a>
          <a class="act" href="/?agents">Advanced Agents</a>
          <a class="act" href="/?account">Account</a>
        </div>
      </section>
    </div>`;
  }

  async function rpcCreate(label) {
    const { data, error } = await db.rpc("agent_token_create", { p_label: label });
    if (error) throw error;
    return data;
  }
  async function rpcList() {
    const { data, error } = await db.rpc("agent_token_list");
    if (error) throw error;
    if (Array.isArray(data)) return data;
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return data ? [data] : [];
  }
  async function loadConnectAgent() {
    const { data, error } = await db
      .from("grinder_agents")
      .select("id,name,visibility")
      .eq("owner_id", me().id)
      .eq("name", "Connect")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    return Array.isArray(data) && data.length ? data[0] : null;
  }

  async function rpcRevoke(id) {
    const { data, error } = await db.rpc("agent_token_revoke", { p_id: id });
    if (error) throw error;
    return data;
  }

  function isMissingRpc(error) {
    const msg = String(error?.message || error || "");
    return /agent_token_create|agent_token_list|agent_token_revoke|could not find the function|schema cache/i.test(msg);
  }

  function startSignIn() {
    if (typeof signInGitHub === "function") signInGitHub();
    else if (typeof signIn === "function") signIn();
    else say("Sign-in is unavailable. Reload the page.", true);
  }

  async function view(issued) {
    const root = mount();
    if (!root) return;
    if (typeof frame === "function") frame(null, null);
    if (!me()) {
      root.innerHTML = signedOutHtml();
      byId("connect-signin")?.addEventListener("click", startSignIn);
      return;
    }
    if (!db) {
      root.innerHTML = unavailableHtml("No database client.");
      return;
    }
    let rows = [];
    let agent = null;
    try {
      rows = await rpcList();
      agent = await loadConnectAgent();
    } catch (error) {
      if (isMissingRpc(error)) {
        root.innerHTML = unavailableHtml(error.message);
        return;
      }
      say(error.message || "Connections could not load.", true);
    }
    root.innerHTML = panelHtml(rows, issued || null, agent);
    wire(issued || null, agent);
  }

  function wire(issued, agent) {
    const form = byId("connect-create");
    const state = byId("connect-create-state");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const label = String(byId("connect-label")?.value || "").trim();
      if (!label || label.length > 80) {
        if (state) {
          state.textContent = "Name must be 1 to 80 characters.";
          state.classList.add("err");
        }
        return;
      }
      const go = byId("connect-create-go");
      if (go) go.disabled = true;
      try {
        const created = await rpcCreate(label);
        if (!created || typeof created.token !== "string" || !created.token) {
          throw new Error("Connect did not return a credential. Check the deployment.");
        }
        say("Connected. Copy the credential now.");
        await view(created);
      } catch (error) {
        if (isMissingRpc(error)) {
          mount().innerHTML = unavailableHtml(error.message);
          return;
        }
        if (state) {
          state.textContent = error.message || "Could not connect.";
          state.classList.add("err");
        }
        say(error.message || "Could not connect.", true);
        if (go) go.disabled = false;
      }
    });

    byId("connect-copy-token")?.addEventListener("click", async () => {
      const value = byId("connect-token-value")?.value;
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        say("Token copied.");
      } catch (_) {
        say("Select and copy the token field.", true);
      }
    });
    byId("connect-copy-paste")?.addEventListener("click", async () => {
      const value = byId("connect-paste")?.value || (issued ? pasteBlock(issued.token) : "");
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        say("One-paste setup copied.");
      } catch (_) {
        say("Select and copy the setup block.", true);
      }
    });

    byId("connect-make-public")?.addEventListener("click", async () => {
      const button = byId("connect-make-public");
      const state = byId("connect-agent-state");
      if (!agent?.id) return;
      if (button) button.disabled = true;
      try {
        const { error } = await db
          .from("grinder_agents")
          .update({ visibility: "public" })
          .eq("id", agent.id);
        if (error) throw error;
        say("Connect agent profile is public. Run audiences did not change.");
        await view(null);
      } catch (error) {
        if (state) {
          state.textContent = error.message || "Could not update visibility.";
          state.classList.add("err");
        }
        say(error.message || "Could not update visibility.", true);
        if (button) button.disabled = false;
      }
    });

    document.querySelectorAll("[data-revoke]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await rpcRevoke(button.dataset.revoke);
          say("Connection revoked.");
          await view(null);
        } catch (error) {
          say(error.message || "Revoke failed.", true);
          button.disabled = false;
        }
      });
    });
  }

  return { view, pasteBlock };
};
