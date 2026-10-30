// Tabletop: the app shell. Routes, header, section links and the screens every
// game shares (library, game page, guide, score pad, setup). A game with its own
// tracker adds screens through games/<slug>/ui.js.

import { GameStore, api, local, uid } from "./core/store.js";
import { activeCats, catValue, maxPlayers, rankPlayers, total } from "./core/score.js";
import { renderGuide, guideAct } from "./core/guide.js";
import { $, esc, chip, btn, icon } from "./core/ui.js";
import { CATALOG, TIER_LABEL, getDef, getEntry, scoreable, tier } from "./games/index.js";

const B = window.Bridgewater;
B.init({ sig: "teal" });

const app = { store: null, sessionId: null, def: null, mod: null, route: { view: "library" }, sessions: null, recent: null, roster: [], showAll: false };
// Per-device view state for the open session. Kept as one object so game screens can hold on to it.
const ui = { active: null, draft: null, sheet: null, pad: null, pick: null };

/* ---------- shell ---------- */
const statusSlot = document.createElement("span");
const promptSlot = document.createElement("div");
function buildHeader() {
  const bar = document.createElement("div");
  bar.className = "bw-container bw-header__bar hdr-bar";
  const right = document.createElement("div");
  right.className = "hdr-right";
  right.append(B.ThemeToggle({ size: "sm" }));
  bar.append(B.Wordmark({ site: "tabletop" }), right);
  const rule = document.createElement("div");
  rule.className = "bw-header__rule";
  const where = document.createElement("div");
  where.className = "bw-container bw-header__where where";
  where.append(promptSlot, statusSlot);
  $("#hdr").replaceChildren(B.Strip(), bar, rule, where);
}
const STATUS = {
  synced: ["ok", "synced"],
  saving: ["off", "saving"],
  offline: ["attention", "offline"],
  reconnecting: ["attention", "reconnecting"],
  failed: ["down", "sync failed"],
};
const inSession = () => !!app.route.id;
function renderStatus() {
  const s = app.store && inSession() ? STATUS[app.store.status] : null;
  statusSlot.replaceChildren(s ? B.Status({ state: s[0], label: s[1] }) : "");
}
const VIEW_PATH = { tracker: "tracker", score: "score-pad", setup: "setup" };
const sessionHome = (def, id) => `/${def.slug}/${id}/${def.tracker ? "tracker" : "score"}`;
// The brand reads the app and path off the URL; only a few segments get a friendlier label.
function renderPrompt() {
  const r = app.route;
  const labels = {};
  if (r.view === "guide" && r.sub === "order") labels[`/${r.slug}/guide/order`] = "play-order";
  if (r.id && VIEW_PATH[r.view]) labels[`/${r.slug}/${r.id}/${r.view}`] = VIEW_PATH[r.view];
  promptSlot.replaceChildren(B.Prompt({ auth: { source: "/api/me" }, labels }));
}
function renderNav() {
  const r = app.route;
  const def = r.slug && getDef(r.slug);
  const nav = $("#nav");
  let links = [];
  if (def && scoreable(def)) {
    const id = r.id || local.get(`tabletop:last:${def.slug}`);
    const to = (view) => (id ? `/${def.slug}/${id}/${view}` : `/${def.slug}`);
    links = [["Guide", `/${def.slug}/guide`, r.view === "guide"]];
    if (def.tracker) links.push(["Tracker", to("tracker"), r.view === "tracker"]);
    links.push(["Score", to("score"), r.view === "score"], ["Setup", to("setup"), r.view === "setup"], ["Sessions", `/${def.slug}`, r.view === "game"]);
  } else if (def) {
    links = [["Guide", `/${def.slug}/guide`, r.view === "guide"], ["All games", "/", false]];
  } else if (r.slug) links = [["All games", "/", false]];
  nav.hidden = !links.length;
  nav.innerHTML = links.map(([l, href, cur]) => `<a href="${href}"${cur ? ' aria-current="page"' : ""}>${l}</a>`).join("");
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2200);
}
// Destructive buttons ask for a second tap instead of a dialog.
function arm(el, fn, label = "Tap again to confirm") {
  if (el.dataset.armed) return fn();
  const old = el.innerHTML;
  el.dataset.armed = "1";
  el.classList.add("bw-btn--danger");
  el.textContent = label;
  setTimeout(() => {
    if (!el.isConnected) return;
    delete el.dataset.armed;
    el.classList.remove("bw-btn--danger");
    el.innerHTML = old;
  }, 3000);
}

/* ---------- routing ---------- */
//   /                         library
//   /:slug                    game page: what it supports, sessions
//   /:slug/guide[/order]      getting started, play order
//   /:slug/:id[/tracker|score|setup]   a session
function parse(path) {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return { view: "library" };
  const [slug, a, b] = parts;
  if (!a) return { view: "game", slug };
  if (a === "guide") return { view: "guide", slug, sub: b === "order" ? "order" : "start" };
  if (/^\d+$/.test(a)) return { view: b || "", slug, id: Number(a) };
  return { view: "missing", slug };
}
function go(path, replace) {
  history[replace ? "replaceState" : "pushState"](null, "", path);
  route();
}
async function route() {
  const r = (app.route = parse(location.pathname));
  closeSheet(false);
  if (r.slug && !getEntry(r.slug)) {
    toast("That game is not in the library.");
    return go("/", true);
  }
  const def = r.slug ? getDef(r.slug) : null;
  if (r.view === "missing" || (r.view === "guide" && !(def && def.guide)) || (r.id && !scoreable(def))) return go(`/${r.slug}`, true);
  if (r.id) {
    if (!["tracker", "score", "setup"].includes(r.view) || (r.view === "tracker" && !def.tracker)) return go(sessionHome(def, r.id), true);
    if (r.id !== app.sessionId) {
      const ok = await openSession(r.id, def);
      if (!ok) return;
    }
  } else closeSession();
  if (r.view === "library") loadLibrary();
  if (r.view === "game" && scoreable(def)) loadSessions(def);
  if (r.view === "setup") loadRoster();
  render();
}
async function openSession(id, def) {
  closeSession();
  app.sessionId = id;
  app.def = def;
  Object.assign(ui, local.get(`tabletop:ui:${id}`) || {}, { pad: null });
  ui.sheet = ui.draft ? "card" : null;
  if (def.tracker) {
    const { default: install } = await import(`./games/${def.slug}/ui.js`);
    app.mod = install({ game, active, dispatch, ui, render, renderSheet, closeSheet, saveUi, toast, arm, sheetHead });
  }
  app.store = new GameStore(id, def, render, renderStatus);
  try {
    await app.store.load();
  } catch (e) {
    closeSession();
    toast(e.status === 404 ? `Session ${id} does not exist.` : "The server is unreachable and this session is not saved on this device.");
    go(`/${def.slug}`, true);
    return false;
  }
  const kind = app.store.base.state.kind;
  if (kind && kind !== def.slug && getDef(kind)) {
    go(`/${kind}/${id}`, true);
    return false;
  }
  local.set(`tabletop:last:${def.slug}`, id);
  return true;
}
function closeSession() {
  if (app.store) app.store.close();
  app.store = app.mod = null;
  app.sessionId = null;
  app.def = null;
  Object.assign(ui, { active: null, draft: null, sheet: null, pad: null, pick: null });
}
const saveUi = () => app.sessionId && local.set(`tabletop:ui:${app.sessionId}`, { active: ui.active, draft: ui.draft, pick: ui.pick });
const game = () => app.store && app.store.state;
const dispatch = (op) => app.store.dispatch(op);
function active() {
  const g = game();
  let p = g.players.find((x) => x.id === ui.active);
  if (!p) {
    p = g.players[0];
    ui.active = p.id;
  }
  return p;
}

/* ---------- render ---------- */
function render() {
  renderPrompt();
  renderNav();
  renderStatus();
  const v = $("#view");
  const r = app.route;
  // A change from another device re-renders the view; keep the field you are typing in.
  const f = document.activeElement;
  const keep = f && f.id && v.contains(f) && f.tagName === "INPUT" ? { id: f.id, value: f.value, a: f.selectionStart, b: f.selectionEnd } : null;
  v.dataset.view = r.view;
  const def = r.slug ? getDef(r.slug) : null;
  if (r.id && !game()) v.innerHTML = `<p class="bw-comment">Loading session ${r.id}.</p>`;
  else if (r.view === "tracker") v.innerHTML = app.mod.views.tracker();
  else if (r.view === "score") v.innerHTML = renderScore();
  else if (r.view === "setup") v.innerHTML = renderSetup();
  else if (r.view === "guide") v.innerHTML = renderGuide(def, r.sub, null);
  else if (r.view === "game") renderGamePage(v, getEntry(r.slug));
  else renderLibrary(v);
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      el.value = keep.value;
      el.focus();
      el.setSelectionRange(keep.a, keep.b);
    }
  }
  renderSheet();
}
const fmtDate = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const shortDate = (t) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
const playersText = (def) => (def && def.players ? `${def.players[0]}–${def.players[1]} players` : "");

/* ---------- library ---------- */
async function loadLibrary() {
  try {
    app.recent = (await api("/api/games")).filter((s) => !s.finishedAt && getDef(s.kind)).slice(0, 3);
  } catch {
    app.recent = [];
  }
  if (app.route.view === "library") render();
}
function renderLibrary(v) {
  const ready = CATALOG.filter((g) => g.def);
  const list = app.showAll ? CATALOG : ready;
  v.innerHTML = `<div class="lib">
    ${app.recent && app.recent.length ? `<section><h2 class="h3">Continue</h2><div id="recentRows"></div></section>` : ""}
    <section><div class="line between"><h2 class="h3">Games</h2><span class="bw-count">${ready.length} of ${CATALOG.length} ready</span></div>
      <div id="gameList"></div>
      ${btn(app.showAll ? "Show ready games only" : `Show all ${CATALOG.length} games`, "showAll", { v: "quiet", sm: true })}</section>
    <div class="sky"></div></div>`;
  if (app.recent && app.recent.length)
    $("#recentRows", v).replaceChildren(
      B.Rows({
        rows: app.recent.map((s) => {
          const d = getDef(s.kind);
          return { name: `${d.short || d.name} · session ${s.id}`, host: `${s.players.join(", ")} · ${shortDate(s.updatedAt)}`, state: "ok", stateLabel: "in progress", href: sessionHome(d, s.id) };
        }),
      }),
    );
  $("#gameList", v).replaceChildren(
    B.Rows({
      rows: list.map((g) => {
        const t = tier(g.def);
        return { name: g.name, host: [g.year, playersText(g.def)].filter(Boolean).join(" · "), state: t === "none" ? "off" : "ok", stateLabel: TIER_LABEL[t], href: `/${g.slug}` };
      }),
    }),
  );
  $(".sky", v).replaceChildren(B.Skyline());
}

/* ---------- game page ---------- */
async function loadSessions(def) {
  try {
    [app.sessions, app.roster] = await Promise.all([api(`/api/games?kind=${def.slug}`), api("/api/roster")]);
  } catch {
    app.sessions = "offline";
  }
  if (app.route.view === "game" && app.route.slug === def.slug) render();
}
function renderGamePage(v, entry) {
  const def = entry.def;
  const t = tier(def);
  const meta = [entry.year, playersText(def), TIER_LABEL[t]].filter(Boolean).join(" · ");
  let body = "";
  if (!def)
    body = `<p class="bw-soft">There is no guide or score pad for this game yet. Each game is one file in <code>public/js/games</code>; the README explains how to add one.</p>`;
  else {
    if (def.guide)
      body += `<div class="line wrap guide-links"><a href="/${def.slug}/guide">Getting started</a>${def.guide.order ? `<a href="/${def.slug}/guide/order">Play order</a>` : ""}</div>`;
    if (scoreable(def)) {
      const last = local.get(`tabletop:last:${def.slug}`);
      body += `<section><div class="line between"><h2 class="h3">Sessions</h2>${btn("New session", "newGame", { v: "primary", data: last ? `data-from="${last}"` : "" })}</div>
        <div id="sessionRows"></div></section>
        <section><h2 class="h3">Saved players</h2><div class="roster">${
          app.roster.length
            ? app.roster.map((n) => `<span class="rname">${esc(n)}${btn(icon("close"), "forget", { v: "quiet", sm: true, cls: "bw-btn--icon", data: `data-name="${esc(n)}"`, aria: `Forget ${n}` })}</span>`).join("")
            : '<p class="bw-comment small">Named players are remembered here once you save a result, in any game.</p>'
        }</div></section>`;
    }
  }
  v.innerHTML = `<div class="gp"><div><h2>${esc(entry.name)}</h2><p class="bw-mono bw-comment small">${meta}</p></div>${body}</div>`;
  const slot = $("#sessionRows", v);
  if (!slot) return;
  const list = app.sessions;
  if (list === "offline") slot.innerHTML = '<p class="bw-comment">The server is unreachable. Sessions load when you are back online.</p>';
  else if (!list) slot.innerHTML = '<p class="bw-comment">Loading sessions.</p>';
  else if (!list.length) slot.innerHTML = '<p class="bw-comment">No sessions yet. Start one with New session.</p>';
  else
    slot.replaceChildren(
      B.Rows({
        rows: list.map((s) => ({
          name: `Session ${s.id}`,
          host: s.result ? s.result.slice(0, 3).map((x) => `${x.n} ${x.t}`).join(" · ") : `${s.players.length} players · ${shortDate(s.updatedAt)}`,
          state: s.finishedAt ? "off" : "ok",
          stateLabel: s.finishedAt ? "finished" : "in progress",
          href: s.finishedAt ? `/${def.slug}/${s.id}/score` : sessionHome(def, s.id),
        })),
      }),
    );
}

/* ---------- score pad ---------- */
function renderScore() {
  const g = game();
  const def = app.def;
  const me = active();
  const stand = rankPlayers(g, def)
    .map(
      (r) => `<li><button type="button" class="st" data-act="pick" data-id="${r.p.id}" aria-pressed="${r.p.id === me.id}">
      <span class="bw-mono rank">${r.rank}</span><span class="ellipsis">${esc(r.p.name || "Unnamed")}</span>
      ${r.tied && r.t !== 0 ? '<span class="bw-status" data-state="attention">tie</span>' : "<span></span>"}
      <span class="bw-count big">${r.t}</span></button></li>`,
    )
    .join("");
  const tiles = activeCats(g, def)
    .map((c) => {
      const v = me.s[c.k] || {};
      const sub = catValue(me, c);
      let detail = "";
      if (c.kind === "mult" && (v.n != null || v.x != null)) detail = `${v.n || 0} × ${v.x || 0}`;
      if (c.kind === "count" && v.n) detail = `${v.n} × ${c.each}`;
      if (c.kind === "signed" && v.v) detail = v.neg ? "penalty" : "bonus";
      return `<button type="button" class="tile${sub ? " on" : ""}" data-act="cat" data-k="${c.k}">
        <span class="tl">${chip(c.c, c.round)}<span class="ellipsis">${c.label}</span></span>
        <span class="tv bw-mono">${sub}</span><span class="td bw-mono">${detail}</span></button>`;
    })
    .join("");
  return `<div class="score">
    <ol class="stand" aria-label="Standings">${stand}</ol>
    <section class="bw-panel sp" aria-label="${esc(me.name)} score">
      <div class="line between"><h3 class="ellipsis">${esc(me.name || "Unnamed")}</h3><span class="bw-count big">${total(g, def, me)}</span></div>
      <div class="tiles">${tiles}</div>
    </section>
    <div class="acts">${app.mod && app.mod.scoreActions ? app.mod.scoreActions(g) : ""}${btn("Clear scores", "clearScores")}</div>
    ${def.score.tiebreakNote ? `<p class="bw-comment small note">${def.score.tiebreakNote}</p>` : ""}</div>`;
}

/* ---------- setup ---------- */
async function loadRoster() {
  try {
    app.roster = await api("/api/roster");
    if (app.route.view === "setup") render();
  } catch {
    /* offline: quick-add buttons stay hidden */
  }
}
function renderSetup() {
  const g = game();
  const def = app.def;
  const max = maxPlayers(g, def);
  const inGame = new Set(g.players.map((p) => p.name.trim().toLowerCase()));
  const avail = app.roster.filter((n) => !inGame.has(n.toLowerCase()));
  const full = g.players.length >= max;
  const over = g.players.length > max;
  let n = 0;
  const num = () => `<span class="bw-secnum">${String(++n).padStart(2, "0")}</span>`;
  const players = g.players
    .map(
      (p, i) => `<li><label class="sr" for="pn-${p.id}">Player ${i + 1} name</label>
      <input class="bw-field__control" id="pn-${p.id}" data-act="rename" data-id="${p.id}" value="${esc(p.name)}" autocomplete="off" enterkeyhint="done" maxlength="40">
      ${btn("Remove", "removePlayer", { v: "quiet", sm: true, data: `data-id="${p.id}"`, disabled: g.players.length < 2 })}</li>`,
    )
    .join("");
  const opts = (def.options || [])
    .map(
      (e) => `<label class="bw-field bw-field--check exp"><input type="checkbox" data-act="exp" data-id="${e.id}" ${g.exp[e.id] ? "checked" : ""}>
      <span><span class="bw-field__label">${e.name}</span><span class="bw-field__hint">${e.note}</span></span></label>`,
    )
    .join("");
  const fin = app.store.base.finishedAt;
  return `<div class="setup">
    <section><h2>${num()}Players <span class="bw-count">${g.players.length} / ${max}</span></h2>
      <ul class="plist">${players}</ul>
      ${over ? `<p class="warn">This setup seats ${max}. Remove ${g.players.length - max} or change the options below.</p>` : ""}
      <div class="line wrap">${btn("Add player", "addPlayer", { sm: true, disabled: full })}
        ${avail.map((nm) => btn(`+ ${esc(nm)}`, "addPlayer", { v: "quiet", sm: true, data: `data-name="${esc(nm)}"`, disabled: full })).join("")}</div></section>
    ${opts ? `<section><h2>${num()}${def.optionsLabel || "Options"}</h2><div class="exps">${opts}</div></section>` : ""}
    <section><div class="line between"><h2>${num()}Session ${app.sessionId}</h2>${btn("Delete", "deleteGame", { v: "quiet", sm: true, aria: `Delete session ${app.sessionId}` })}</div>
      <p class="bw-comment small">${fin ? `Result saved ${fmtDate(fin)}. Saving again updates it.` : "In progress. Save the result when you finish scoring."}</p>
      <div class="acts">${btn(fin ? "Update result" : "Save result", "finish", { v: "primary" })}${btn("New session, same players", "newGame", { data: `data-from="${app.sessionId}"` })}</div></section>
  </div>`;
}

/* ---------- sheets ---------- */
function renderSheet() {
  const el = $("#sheet");
  const g = game();
  const sheet = ui.sheet === "pad" ? { render: renderPad, label: "Enter score" } : ui.sheet && app.mod && app.mod.sheets[ui.sheet];
  if (!sheet || !g || !inSession()) {
    el.hidden = true;
    el.innerHTML = "";
    document.documentElement.classList.remove("locked");
    return;
  }
  document.documentElement.classList.add("locked");
  el.hidden = false;
  el.className = `sheet sheet--${ui.sheet}`;
  el.innerHTML = sheet.render(g);
  el.setAttribute("aria-label", sheet.label);
}
function closeSheet(rerender = true) {
  if (ui.sheet === "pad") commitPad();
  ui.sheet = null;
  ui.draft = null;
  ui.pad = null;
  saveUi();
  if (rerender) render();
}
function sheetHead(title) {
  return `<div class="sh-head"><h2 class="h3 ellipsis">${title}</h2>${btn(icon("close"), "close", { cls: "bw-btn--icon", aria: "Close" })}</div>`;
}

/* Score keypad: a number pad in a bottom sheet, so the phone keyboard never covers the page. */
const catOf = (key) => app.def.score.cats.find((x) => x.k === key);
const firstField = (c) => (c.kind === "mult" || c.kind === "count" ? "n" : "v");
function openPad(key) {
  const v = active().s[key] || {};
  ui.pad = { key, field: firstField(catOf(key)), vals: { ...v }, fresh: true };
  ui.sheet = "pad";
  render();
}
function commitPad() {
  const pad = ui.pad;
  if (!pad || !game()) return;
  const p = active();
  if (JSON.stringify(p.s[pad.key] || {}) !== JSON.stringify(pad.vals)) dispatch({ type: "setCat", player: p.id, key: pad.key, value: pad.vals });
}
function renderPad(g) {
  const pad = ui.pad;
  const c = catOf(pad.key);
  const v = pad.vals;
  const f = (k, label) =>
    `<button type="button" class="pf" data-act="padField" data-k="${k}" aria-pressed="${pad.field === k}" aria-label="${label}"><span>${label}</span><b class="bw-mono">${v[k] ?? ""}</b></button>`;
  let fields;
  if (c.kind === "mult") fields = `${f("n", "Count")}<span class="bw-mono x">×</span>${f("x", "VP each")}`;
  else if (c.kind === "count") fields = `${f("n", "Count")}<span class="bw-mono x">× ${c.each}</span>`;
  else if (c.kind === "signed") fields = `${btn(v.neg ? "−" : "+", "padSign", { cls: `sign${v.neg ? " neg" : ""}`, aria: v.neg ? "Penalty. Switch to bonus." : "Bonus. Switch to penalty." })}${f("v", "Points")}`;
  else if (c.kind === "minus") fields = `<span class="bw-mono x">−</span>${f("v", "Points lost")}`;
  else fields = f("v", "Points");
  const sub = catValue({ s: { [c.k]: v } }, c);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"]
    .map((k) => btn(k === "clear" ? "Clear" : k === "del" ? "Delete" : k, "padKey", { data: `data-k="${k}"`, cls: "key" }))
    .join("");
  const cats = activeCats(g, app.def);
  const last = cats[cats.length - 1].k === c.k && (c.kind !== "mult" || pad.field === "x");
  return `${sheetHead(`${chip(c.c, c.round)}${c.label} · ${esc(active().name || "Unnamed")}`)}
    <p class="bw-comment small">${c.note}</p>
    <div class="pfields">${fields}<span class="bw-mono eq">= ${sub}</span></div>
    <div class="keys">${keys}</div>
    <div class="sh-foot">${btn("Next", "padNext", { disabled: last })}${btn("Done", "close", { v: "primary" })}</div>`;
}

/* ---------- actions ---------- */
const acts = {
  showAll: () => {
    app.showAll = !app.showAll;
    render();
  },
  pick: (el) => {
    ui.active = el.dataset.id;
    saveUi();
    render();
  },
  close: () => closeSheet(),
  cat: (el) => openPad(el.dataset.k),
  padField: (el) => {
    ui.pad.field = el.dataset.k;
    ui.pad.fresh = true;
    renderSheet();
  },
  padSign: () => {
    ui.pad.vals.neg = !ui.pad.vals.neg;
    if (!ui.pad.vals.neg) delete ui.pad.vals.neg;
    renderSheet();
  },
  padKey: (el) => {
    const pad = ui.pad;
    const k = el.dataset.k;
    const cur = pad.fresh ? "" : String(pad.vals[pad.field] ?? "");
    let next;
    if (k === "clear") next = "";
    else if (k === "del") next = String(pad.vals[pad.field] ?? "").slice(0, -1);
    else next = (cur + k).replace(/^0+(?=\d)/, "").slice(0, 4);
    pad.fresh = false;
    if (next === "") delete pad.vals[pad.field];
    else pad.vals[pad.field] = +next;
    renderSheet();
  },
  padNext: () => {
    const pad = ui.pad;
    if (catOf(pad.key).kind === "mult" && pad.field === "n") {
      pad.field = "x";
      pad.fresh = true;
      return renderSheet();
    }
    commitPad();
    const cats = activeCats(game(), app.def);
    const i = cats.findIndex((x) => x.k === pad.key);
    if (cats[i + 1]) openPad(cats[i + 1].k);
  },
  clearScores: (el) => arm(el, () => {
    dispatch({ type: "clearScores", player: active().id });
    toast("Scores cleared.");
  }),
  addPlayer: (el) => {
    const g = game();
    const id = uid();
    dispatch({ type: "addPlayer", id, name: el.dataset.name || `Player ${g.players.length + 1}` });
    ui.active = id;
    saveUi();
    if (!el.dataset.name) {
      const inp = $(`#pn-${id}`);
      if (inp) {
        inp.focus();
        inp.select();
      }
    }
  },
  removePlayer: (el) => arm(el, () => dispatch({ type: "removePlayer", id: el.dataset.id }), "Remove?"),
  finish: async () => {
    try {
      await app.store.finish();
      toast("Result saved.");
      loadRoster();
    } catch {
      toast("Could not save the result. Check the connection and try again.");
    }
  },
  // Deletes the open session for everyone, and its copy on this device.
  deleteGame: (el) => arm(el, async () => {
    const id = app.sessionId;
    const def = app.def;
    try {
      await api(`/api/games/${id}`, { method: "DELETE" });
    } catch (e) {
      if (e.status !== 404) return toast("Deleting a session needs the server. Check the connection.");
    }
    ["game", "pending", "ui"].forEach((k) => local.del(`tabletop:${k}:${id}`));
    if (String(local.get(`tabletop:last:${def.slug}`)) === String(id)) local.del(`tabletop:last:${def.slug}`);
    closeSession();
    toast(`Session ${id} deleted.`);
    go(`/${def.slug}`);
  }, "Delete for everyone?"),
  newGame: async (el) => {
    const def = getDef(app.route.slug);
    try {
      const body = { kind: def.slug };
      if (el.dataset.from) body.from = Number(el.dataset.from);
      const s = await api("/api/games", { method: "POST", body });
      go(`/${def.slug}/${s.id}/setup`);
    } catch {
      toast("Starting a session needs the server. Check the connection.");
    }
  },
  forget: async (el) => {
    await api(`/api/roster/${encodeURIComponent(el.dataset.name)}`, { method: "DELETE" }).catch(() => {});
    loadSessions(getDef(app.route.slug));
  },
};

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href^='/']");
  if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && a.origin === location.origin) {
    e.preventDefault();
    if (a.pathname !== location.pathname) go(a.pathname);
    return;
  }
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled || el.tagName === "INPUT" || el.tagName === "SELECT") return;
  if (el.tagName === "TR" && e.target.closest("button")) return; // the name button handles it
  const name = el.dataset.act;
  const fn = acts[name] || (app.mod && app.mod.acts[name]);
  if (fn) return fn(el, e);
  const def = app.route.slug && getDef(app.route.slug);
  if (def) guideAct(el, def, render);
});
document.addEventListener("input", (e) => {
  if (app.mod && app.mod.onInput) app.mod.onInput(e.target);
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (app.mod && app.mod.onChange && app.mod.onChange(t)) return;
  if (t.dataset.act === "rename") dispatch({ type: "renamePlayer", id: t.dataset.id, name: t.value.trim() });
  else if (t.dataset.act === "exp") dispatch({ type: "setExp", id: t.dataset.id, on: t.checked });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.sheet) closeSheet();
  if (e.key === "Enter" && e.target.dataset.act === "rename") e.target.blur();
  if (ui.sheet === "pad" && /^[0-9]$|^Backspace$/.test(e.key)) acts.padKey({ dataset: { k: e.key === "Backspace" ? "del" : e.key } });
});
window.addEventListener("popstate", route);
window.addEventListener("online", () => app.store && app.store.flush());

buildHeader();
route();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
