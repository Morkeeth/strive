/* Origin is Cursor's code forge. This module models repository installation after STRIVE
 * sign-in; it is not an Auth provider and never participates in account matching.
 *
 * No Origin application is registered today, so the shipped controller has no connector and
 * the Account page explains that the connection is unavailable. A reviewed connector can later implement
 * connect/disconnect without changing the account or identity contracts.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GrinderOrigin = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const esc = (x) =>
    String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function state({ signedIn, configured, connections = [], outcome = null, error = null } = {}) {
    if (!signedIn) return { kind: "hidden", connections: [] };
    if (!configured) return { kind: "unavailable", connections: [] };
    if (outcome === "cancelled") return { kind: "cancelled", connections };
    if (error) return { kind: "error", connections, message: String(error.message || error) };
    if (outcome === "disconnected") return { kind: "disconnected", connections };
    if (connections.length) return { kind: "connected", connections };
    return { kind: "connect", connections: [] };
  }

  function html(value) {
    if (!value || value.kind === "hidden") return "";
    if (value.kind === "unavailable") return `<section class="card pad account-section" id="origin-connection" aria-labelledby="origin-title"><h2 id="origin-title">Origin repositories</h2>
      <p>Origin repository connection is not available on this service yet. It is separate from signing in to STRIVE.</p>
      <p class="account-hint">No Origin repository access has been granted here. You can still record a local session with the capture tool.</p>
      <div class="account-actions"><a class="act" href="/?feedback">Request Origin connection</a><a class="act" href="/?post">Record a session</a></div></section>`;
    const rows = (value.connections || []).map((connection) => {
      const name = connection.repository || connection.name || "Selected repository";
      const remove = value.kind === "connected"
        ? `<button type="button" class="act" data-origin-disconnect="${esc(connection.id || name)}">Disconnect</button>`
        : "";
      return `<li class="account-identity"><div><strong>${esc(name)}</strong> <span class="account-hint">Origin repository</span></div>${remove}</li>`;
    }).join("");
    const notices = {
      cancelled: "<strong>Origin connection was cancelled.</strong> Nothing changed.",
      error: `<strong>Origin could not connect.</strong> ${esc(value.message || "Try again.")}`,
      disconnected: "<strong>Origin repository disconnected.</strong> It no longer has access through __BRAND__.",
    };
    const notice = notices[value.kind]
      ? `<div class="account-notice" role="status" aria-live="polite"><p>${notices[value.kind]}</p></div>`
      : "";
    const empty = value.connections?.length ? "" : '<p class="account-hint">No Origin repositories are connected.</p>';
    const connect = '<div class="account-actions"><button type="button" class="act" data-origin-connect>Connect Origin repositories</button></div>';
    return `<section class="card pad account-section" id="origin-connection" aria-labelledby="origin-title"><h2 id="origin-title">Origin repositories</h2>
      <p>Connect selected repositories after signing in to __BRAND__. Origin is Cursor&rsquo;s code forge, not a sign-in method.</p>
      ${notice}${rows ? `<ul class="account-identities">${rows}</ul>` : ""}${empty}${connect}
      <p id="origin-state" class="account-state" role="status" aria-live="polite"></p></section>`;
  }

  function create({ connector = null } = {}) {
    let current = { connections: [], outcome: null, error: null };
    const configured = !!connector && typeof connector.connect === "function";
    const snapshot = (signedIn = true) => state({ signedIn, configured, ...current });

    async function connect() {
      if (!configured) return snapshot();
      try {
        const result = await connector.connect();
        if (!result || result.cancelled) current = { ...current, outcome: "cancelled", error: null };
        else current = { connections: result.connections || [result], outcome: null, error: null };
      } catch (error) {
        current = { ...current, outcome: null, error };
      }
      return snapshot();
    }

    async function disconnect(id) {
      if (!connector || typeof connector.disconnect !== "function") {
        current = { ...current, outcome: null, error: new Error("Origin disconnect is unavailable.") };
        return snapshot();
      }
      try {
        await connector.disconnect(id);
        current = { connections: current.connections.filter((c) => String(c.id || c.name) !== String(id)), outcome: "disconnected", error: null };
      } catch (error) {
        current = { ...current, outcome: null, error };
      }
      return snapshot();
    }

    function mount(root, { signedIn = true } = {}) {
      const section = root?.querySelector?.("#origin-connection");
      if (!section || !signedIn) return;
      const paint = (next) => {
        section.outerHTML = html(next);
        mount(root, { signedIn });
      };
      section.querySelector("[data-origin-connect]")?.addEventListener("click", async (event) => {
        event.currentTarget.disabled = true;
        const line = section.querySelector("#origin-state"); if (line) line.textContent = "Opening Origin…";
        paint(await connect());
      });
      section.querySelectorAll("[data-origin-disconnect]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        paint(await disconnect(button.dataset.originDisconnect));
      }));
    }

    return { configured, state: snapshot, html: ({ signedIn = true } = {}) => html(snapshot(signedIn)), mount, connect, disconnect };
  }

  return { create, state, html };
});
