import * as R from "./rules.js";
import { GameStore, api, local, uid } from "./store.js";
import { renderGuide, guideAct } from "./guide.js";

const B = window.Bridgewater;
B.init({ sig: "teal" });

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const chip = (c, round) => (c ? `<i class="chip${round ? " round" : ""}" style="--c:var(${c})"></i>` : "");
const btn = (label, act, { v = "secondary", sm, data = "", pressed, disabled, cls = "", aria } = {}) =>
  `<button type="button" class="bw-btn bw-btn--${v}${sm ? " bw-btn--sm" : ""}${cls ? " " + cls : ""}" data-act="${act}" ${data}` +
  `${pressed === undefined ? "" : ` aria-pressed="${!!pressed}"`}${disabled ? " disabled" : ""}${aria ? ` aria-label="${esc(aria)}"` : ""}>${label}</button>`;
const icon = (name) => B.Icon({ name }).outerHTML;

const app = { me: null, store: null, gameId: null, route: { view: "home" }, games: null, roster: [] };
let ui = { active: null, draft: null, sheet: null, pad: null };

/* ---------- shell ---------- */
const statusSlot = document.createElement("span");
const promptSlot = document.createElement("div");
function buildHeader() {
  const bar = document.createElement("div");
  bar.className = "bw-container bw-header__bar hdr-bar";
  const right = document.createElement("div");
  right.className = "hdr-right";
  right.append(B.ThemeToggle({ size: "sm" }));
  bar.append(B.Wordmark({ href: "/", height: 24 }), right);
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
function renderStatus() {
  const s = app.store && isGameView() ? STATUS[app.store.status] : null;
  statusSlot.replaceChildren(s ? B.Status({ state: s[0], label: s[1] }) : "");
}
function renderPrompt() {
  const r = app.route;
  const path = [{ label: "~", href: "/" }];
  if (r.gameId) {
    path.push({ label: "games", href: "/games" }, { label: String(r.gameId), href: `/games/${r.gameId}/tracker` }, VIEW_PATH[r.view]);
  } else if (r.view === "games") path.push("games");
  else if (r.view === "guide") path.push({ label: "guide", href: "/guide" }, r.sub === "order" ? "play-order" : "getting-started");
  promptSlot.replaceChildren(B.Prompt({ user: app.me || "you", path }));
}
const VIEW_PATH = { tracker: "tracker", score: "score-pad", setup: "setup" };
function renderNav() {
  const g = app.gameId || local.get("iaww:last");
  const r = app.route;
  const links = [
    ["Tracker", g ? `/games/${g}/tracker` : "/games", r.view === "tracker"],
    ["Score", g ? `/games/${g}/score` : "/games", r.view === "score"],
    ["Setup", g ? `/games/${g}/setup` : "/games", r.view === "setup"],
    ["Games", "/games", r.view === "games"],
    ["Guide", "/guide", r.view === "guide"],
  ];
  $("#nav").innerHTML = links
    .map(([l, href, cur]) => `<a href="${href}"${cur ? ' aria-current="page"' : ""}>${l}</a>`)
    .join("");
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
function parse(path) {
  let m = path.match(/^\/games\/(\d+)(?:\/(tracker|score|setup))?\/?$/);
  if (m) return { view: m[2] || "tracker", gameId: Number(m[1]) };
  if (/^\/games\/?$/.test(path)) return { view: "games" };
  m = path.match(/^\/guide(?:\/(order|start))?\/?$/);
  if (m) return { view: "guide", sub: m[1] || "start" };
  return { view: "home" };
}
const isGameView = () => !!app.route.gameId;
export function go(path, replace) {
  history[replace ? "replaceState" : "pushState"](null, "", path);
  route();
}
async function route() {
  app.route = parse(location.pathname);
  closeSheet(false);
  const r = app.route;
  if (r.view === "home") {
    const games = await api("/api/games").catch(() => null);
    const open = games && games.find((g) => !g.finishedAt);
    const last = local.get("iaww:last");
    if (open) return go(`/games/${open.id}/tracker`, true);
    if (!games && last) return go(`/games/${last}/tracker`, true);
    return go("/games", true);
  }
  if (r.gameId && r.gameId !== app.gameId) await openGame(r.gameId);
  if (r.view === "games") loadGames();
  if (r.view === "setup") loadRoster();
  render();
}
async function openGame(id) {
  if (app.store) app.store.close();
  app.gameId = id;
  ui = local.get(`iaww:ui:${id}`) || { active: null, draft: null };
  ui.sheet = ui.draft ? "card" : null;
  app.store = new GameStore(id, render, renderStatus);
  try {
    await app.store.load();
    local.set("iaww:last", id);
  } catch (e) {
    app.store = null;
    app.gameId = null;
    if (e.status === 404) local.del("iaww:last");
    toast(e.status === 404 ? `Game ${id} does not exist.` : "The server is unreachable and this game is not saved on this device.");
    return go("/games", true);
  }
}
const saveUi = () => app.gameId && local.set(`iaww:ui:${app.gameId}`, { active: ui.active, draft: ui.draft });
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
  if (r.gameId && !game()) v.innerHTML = `<p class="bw-comment">Loading game ${r.gameId}.</p>`;
  else if (r.view === "tracker") v.innerHTML = renderTracker();
  else if (r.view === "score") v.innerHTML = renderScore();
  else if (r.view === "setup") v.innerHTML = renderSetup();
  else if (r.view === "games") renderGames(v);
  else if (r.view === "guide") v.innerHTML = renderGuide(r.sub, game());
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

/* ---------- tracker ---------- */
function renderTracker() {
  const g = game();
  const me = active();
  const list = g.players.map((p) => ({ p, s: R.stats(g, p) }));
  const leads = {};
  R.RES.forEach((r) => (leads[r.k] = R.leaderOf(list, r.k)));
  const rounds = [1, 2, 3, 4]
    .map((n) => btn(String(n), "round", { sm: true, data: `data-n="${n}"`, pressed: g.round === n, aria: `Round ${n}` }))
    .join("");
  let t = `<table class="prod"><thead><tr><th scope="col">Player</th>`;
  t += R.RES.map(
    (r) => `<th scope="col"><span class="rh">${chip(r.c)}${r.s}</span>
      <button type="button" class="tokpref" data-act="tokpref" data-res="${r.k}" aria-label="${r.label} supremacy gives a ${R.TOK[g.tokPref[r.k]].label}. Switch.">${g.tokPref[r.k] === "fin" ? "Fin" : "Gen"}</button></th>`,
  ).join("");
  t += `<th scope="col">VP</th></tr></thead><tbody>`;
  list.forEach(({ p, s }) => {
    t += `<tr class="${p.id === me.id ? "on" : ""}" data-act="pick" data-id="${p.id}"><th scope="row" class="pn">
      <button type="button" data-act="pick" data-id="${p.id}" aria-pressed="${p.id === me.id}">${esc(p.name || "Unnamed")}</button>
      <small>${s.built} cards · F${s.tok.fin} G${s.tok.gen}</small></th>`;
    R.RES.forEach((r) => {
      const v = s.prod[r.k];
      const L = leads[r.k];
      const lead = v > 0 && L.who.length === 1 && L.who[0].id === p.id;
      t += `<td class="v${v ? "" : " zero"}${lead ? " lead" : ""}">${v}</td>`;
    });
    t += `<td class="vp"><span class="bw-count">${s.vp}</span></td></tr>`;
  });
  t += `</tbody><tfoot><tr><th scope="row" class="bw-comment">Supremacy</th>`;
  R.RES.forEach((r) => {
    const done = g.log.find((e) => e.kind === "award" && e.round === g.round && e.res === r.k);
    const L = leads[r.k];
    let b;
    if (done) b = `<span class="award done" title="${esc(R.playerName(g, done.player))}">${icon("check")}${esc(initials(R.playerName(g, done.player)))}</span>`;
    else if (L.best === 0) b = `<span class="award none">none</span>`;
    else if (L.who.length > 1) b = `<span class="award none">tie</span>`;
    else b = `<button type="button" class="award go" data-act="award" data-res="${r.k}" aria-label="Give ${esc(L.who[0].name)} the ${r.label} supremacy ${R.TOK[g.tokPref[r.k]].label}"><span>Give</span><span>${esc(initials(L.who[0].name))}</span></button>`;
    t += `<td>${b}</td>`;
  });
  t += `<td></td></tr></tfoot></table>`;

  const s = R.stats(g, me);
  const emp = g.log.some((e) => e.kind === "build" && e.player === me.id && e.card.type === "empire");
  const toks = ["fin", "gen"]
    .map(
      (k) => `<div class="stepper"><span>${chip(R.TOK[k].c, true)}<span class="word">${R.TOK[k].label}s</span></span>
      ${btn("−", "adj", { sm: true, data: `data-k="${k}" data-n="-1"`, disabled: s.tok[k] <= 0, aria: `Remove a ${R.TOK[k].label}` })}
      <b class="bw-mono">${s.tok[k]}</b>
      ${btn("+", "adj", { sm: true, data: `data-k="${k}" data-n="1"`, aria: `Add a ${R.TOK[k].label}` })}</div>`,
    )
    .join("");
  return `<div class="trk">
    <div class="line between"><div class="line"><span class="lbl">Round</span><div class="seg">${rounds}</div></div>
      ${btn(`History <span class="bw-count">${g.log.length}</span>`, "showLog", { v: "quiet", sm: true })}</div>
    <div class="tablewrap">${t}</div>
    <section class="bw-panel pp" aria-label="${esc(me.name)}">
      <div class="line between"><h3 class="ellipsis">${esc(me.name || "Unnamed")}</h3><span class="bw-count">${s.vp} VP</span></div>
      <div class="counts">${R.TYPES.map((t) => `<span title="${t.label}">${chip(t.c)}<span class="bw-mono">${s.counts[t.k]}</span></span>`).join("")}<span class="bw-comment">built</span></div>
      <div class="toks">${toks}</div>
      <div class="acts">${btn("Log card", "newCard", { v: "primary" })}${btn("Empire", "empire", { aria: emp ? "Edit empire card" : "Set empire card" })}${btn("Undo", "undo")}</div>
    </section></div>`;
}
const initials = (n) => {
  const w = String(n || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  return w.length > 1 ? (w[0][0] + w[1][0]).toUpperCase() : w[0].slice(0, 3);
};

/* ---------- score pad ---------- */
function renderScore() {
  const g = game();
  const me = active();
  const ranked = R.rankPlayers(g);
  const stand = ranked
    .map(
      (r) => `<li><button type="button" class="st" data-act="pick" data-id="${r.p.id}" aria-pressed="${r.p.id === me.id}">
      <span class="bw-mono rank">${r.rank}</span><span class="ellipsis">${esc(r.p.name || "Unnamed")}</span>
      ${r.tied && r.t > 0 ? '<span class="bw-status" data-state="attention">tie</span>' : "<span></span>"}
      <span class="bw-count big">${r.t}</span></button></li>`,
    )
    .join("");
  const tiles = R.activeCats(g)
    .map((c) => {
      const v = me.s[c.k] || {};
      const sub = R.catValue(me, c);
      let detail = "";
      if (c.kind === "mult" && (v.n != null || v.x != null)) detail = `${v.n || 0} × ${v.x || 0}`;
      if (c.kind === "signed" && v.v) detail = v.neg ? "penalty" : "bonus";
      return `<button type="button" class="tile${sub ? " on" : ""}" data-act="cat" data-k="${c.k}">
        <span class="tl">${chip(c.c, c.round)}<span class="ellipsis">${c.label}</span></span>
        <span class="tv bw-mono">${sub}</span><span class="td bw-mono">${detail}</span></button>`;
    })
    .join("");
  const tracked = g.log.length > 0;
  return `<div class="score">
    <ol class="stand" aria-label="Standings">${stand}</ol>
    <section class="bw-panel sp" aria-label="${esc(me.name)} score">
      <div class="line between"><h3 class="ellipsis">${esc(me.name || "Unnamed")}</h3><span class="bw-count big">${R.total(g, me)} VP</span></div>
      <div class="tiles">${tiles}</div>
    </section>
    <div class="acts">${btn("Fill from tracker", "fill", { disabled: !tracked })}${btn("Clear scores", "clearScores")}</div>
    <p class="bw-comment small note">Ties break on cards built, then character tokens.</p></div>`;
}

/* ---------- setup ---------- */
function renderSetup() {
  const g = game();
  const max = R.maxPlayers(g);
  const inGame = new Set(g.players.map((p) => p.name.trim().toLowerCase()));
  const avail = app.roster.filter((n) => !inGame.has(n.toLowerCase()));
  const full = g.players.length >= max;
  const over = g.players.length > max;
  const players = g.players
    .map(
      (p, i) => `<li><label class="sr" for="pn-${p.id}">Player ${i + 1} name</label>
      <input class="bw-field__control" id="pn-${p.id}" data-act="rename" data-id="${p.id}" value="${esc(p.name)}" autocomplete="off" enterkeyhint="done" maxlength="40">
      ${btn("Remove", "removePlayer", { v: "quiet", sm: true, data: `data-id="${p.id}"`, disabled: g.players.length < 2 })}</li>`,
    )
    .join("");
  const exps = R.EXPANSIONS.map(
    (e) => `<label class="bw-field bw-field--check exp"><input type="checkbox" data-act="exp" data-id="${e.id}" ${g.exp[e.id] ? "checked" : ""}>
      <span><span class="bw-field__label">${e.name}</span><span class="bw-field__hint">${e.note}</span></span></label>`,
  ).join("");
  const fin = app.store.base.finishedAt;
  return `<div class="setup">
    <section><h2><span class="bw-secnum">01</span>Players <span class="bw-count">${g.players.length} / ${max}</span></h2>
      <ul class="plist">${players}</ul>
      ${over ? `<p class="warn">The base game seats ${max}. Remove ${g.players.length - max} or turn on Corruption &amp; Ascension.</p>` : ""}
      <div class="line wrap">${btn("Add player", "addPlayer", { sm: true, disabled: full })}
        ${avail.map((n) => btn(`+ ${esc(n)}`, "addPlayer", { v: "quiet", sm: true, data: `data-name="${esc(n)}"`, disabled: full })).join("")}</div></section>
    <section><h2><span class="bw-secnum">02</span>Expansions</h2><div class="exps">${exps}</div></section>
    <section><h2><span class="bw-secnum">03</span>Game ${app.gameId}</h2>
      <p class="bw-comment small">${fin ? `Result saved ${fmtDate(fin)}. Saving again updates it.` : "In progress. Save the result when you finish scoring."}</p>
      <div class="acts">${btn(fin ? "Update result" : "Save result", "finish", { v: "primary" })}${btn("New game, same players", "newGame")}</div></section>
  </div>`;
}
const fmtDate = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

/* ---------- games ---------- */
async function loadGames() {
  try {
    [app.games, app.roster] = await Promise.all([api("/api/games"), api("/api/roster")]);
  } catch {
    app.games = app.games || "offline";
  }
  if (app.route.view === "games") render();
}
async function loadRoster() {
  try {
    app.roster = await api("/api/roster");
    if (app.route.view === "setup") render();
  } catch {
    /* offline: quick-add buttons stay hidden */
  }
}
function renderGames(v) {
  const list = app.games;
  v.innerHTML = `<div class="games"><div class="line between"><h2>Games</h2>${btn("New game", "newGame", { v: "primary", data: 'data-blank="1"' })}</div>
    <div id="gameRows"></div>
    <section><h2 class="h3">Saved players</h2><div class="roster">${
      app.roster.length
        ? app.roster.map((n) => `<span class="rname">${esc(n)}${btn(icon("close"), "forget", { v: "quiet", sm: true, cls: "bw-btn--icon", data: `data-name="${esc(n)}"`, aria: `Forget ${n}` })}</span>`).join("")
        : '<p class="bw-comment small">Named players are remembered here once you save a result.</p>'
    }</div></section><div class="sky"></div></div>`;
  const slot = $("#gameRows", v);
  if (list === "offline") slot.innerHTML = '<p class="bw-comment">The server is unreachable. Games load when you are back online.</p>';
  else if (!list) slot.innerHTML = '<p class="bw-comment">Loading games.</p>';
  else if (!list.length) slot.innerHTML = '<p class="bw-comment">No games yet. Start one with New game.</p>';
  else
    slot.replaceChildren(
      B.Rows({
        rows: list.map((gm) => ({
          name: `Game ${gm.id}`,
          host: gm.result
            ? gm.result.slice(0, 3).map((x) => `${x.n} ${x.t}`).join(" · ")
            : `${gm.players.length} players · ${new Date(gm.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}`,
          state: gm.finishedAt ? "off" : "ok",
          stateLabel: gm.finishedAt ? "finished" : "in progress",
          href: `/games/${gm.id}/${gm.finishedAt ? "score" : "tracker"}`,
        })),
      }),
    );
  $(".sky", v).replaceChildren(B.Skyline());
}

/* ---------- sheets: card form, history, keypad ---------- */
function renderSheet() {
  const el = $("#sheet");
  const g = game();
  if (!ui.sheet || !g || !isGameView()) {
    el.hidden = true;
    el.innerHTML = "";
    document.documentElement.classList.remove("locked");
    return;
  }
  document.documentElement.classList.add("locked");
  el.hidden = false;
  el.className = `sheet sheet--${ui.sheet}`;
  if (ui.sheet === "card") el.innerHTML = renderCardForm(g);
  if (ui.sheet === "log") el.innerHTML = renderLog(g);
  if (ui.sheet === "pad") el.innerHTML = renderPad(g);
  el.setAttribute("aria-label", { card: "Log a card", log: "Round history", pad: "Enter score" }[ui.sheet]);
}
function closeSheet(rerender = true) {
  if (ui.sheet === "pad") commitPad();
  ui.sheet = null;
  ui.draft = null;
  ui.pad = null;
  saveUi();
  if (rerender) render();
}
const sheetHead = (title) =>
  `<div class="sh-head"><h2 class="h3 ellipsis">${title}</h2>${btn(icon("close"), "close", { cls: "bw-btn--icon", aria: "Close" })}</div>`;

const get = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
function set(o, path, v) {
  const ks = path.split(".");
  const last = ks.pop();
  const t = ks.reduce((a, k) => a[k] || (a[k] = {}), o);
  if (v === "" || v == null || (v === 0 && !/\.(res|per|t|a|b)$/.test(path))) delete t[last];
  else t[last] = v;
}
function blankDraft(type) {
  return { player: ui.active, type, cost: {}, prod: {}, corr: {}, scale: { res: "", per: "", n: 0 }, bonus: {}, recycle: "", vp: 0, combo: { t: "", x: 0 }, duo: { a: "", b: "", x: 0 }, tab: {}, custom: {} };
}
function cubeRow(path, color, label) {
  const d = ui.draft;
  const v = get(d, path) || 0;
  const custom = !!d.custom[path] || v > 5;
  let h = `<div class="cubes" role="radiogroup" aria-label="${label}">`;
  for (let n = 0; n <= 5; n++) {
    const on = !custom && v === n;
    h += `<button type="button" class="cube${n === 0 ? " zero" : ""}${color ? "" : " plain"}" ${color ? `style="--c:var(${color});--on:var(${color}-on)"` : ""} role="radio" data-act="cube" data-path="${path}" data-n="${n}" aria-checked="${on}" aria-label="${n} ${label}">${n}</button>`;
  }
  h += `<button type="button" class="cube more" role="radio" data-act="customCube" data-path="${path}" aria-checked="${custom}">More</button>`;
  if (custom) h += numIn(path, `Custom ${label}`, "custom-in");
  return h + `</div>`;
}
const numIn = (path, aria, cls = "") =>
  `<input class="num ${cls}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0" data-act="draftNum" data-path="${path}" value="${get(ui.draft, path) || ""}" aria-label="${aria}">`;
function picker(sec, keys) {
  const d = ui.draft;
  const cur = keys.includes(d.tab[sec]) ? d.tab[sec] : keys[0];
  const tabs = keys
    .map((k) => {
      const val = get(d, sec + "." + k) || 0;
      return `<button type="button" class="ctab" data-act="ctab" data-sec="${sec}" data-k="${k}" aria-pressed="${k === cur}">${chip(R.KEYS[k].c, R.KEYS[k].round)}${R.KEYS[k].s}${val ? `<b class="bw-mono">${val}</b>` : ""}</button>`;
    })
    .join("");
  return `<div class="ctabs">${tabs}</div>${cubeRow(sec + "." + cur, R.KEYS[cur].c, R.KEYS[cur].label)}`;
}
const opts = (list, cur, blank) =>
  (blank ? `<option value="">${blank}</option>` : "") + list.map((o) => `<option value="${o.k}" ${cur === o.k ? "selected" : ""}>${o.label}</option>`).join("");
const sel = (path, list, blank, aria) => `<select class="bw-field__control" data-act="draftSel" data-path="${path}" aria-label="${aria}">${opts(list, get(ui.draft, path), blank)}</select>`;

function renderCardForm(g) {
  const d = ui.draft;
  const emp = d.type === "empire";
  const secs = emp ? ["prod", "vp"] : ["cost", "prod"].concat(g.exp.ca ? ["corr"] : [], ["bonus", "vp"]);
  const SEC = { cost: "Cost", prod: "Produce", corr: "Corrupt", bonus: "Bonus", vp: "VP" };
  const sec = secs.includes(d.sec) ? d.sec : secs[0];
  const targets = R.TYPES.concat([{ k: "fin", label: "Financier" }, { k: "gen", label: "General" }]);
  const filled = (k) => {
    if (k === "vp") return (d.vp ? 1 : 0) + (d.combo.x && d.combo.t ? 1 : 0) + (d.duo.x && d.duo.a && d.duo.b ? 1 : 0);
    let n = Object.values(d[k] || {}).filter(Boolean).length;
    if (k === "prod" && d.scale.n && d.scale.res && d.scale.per) n++;
    if (k === "bonus" && d.recycle) n++;
    return n;
  };
  let body = "";
  if (sec === "cost") body = picker("cost", R.RES_KEYS.concat(["kry", "fin", "gen"]));
  if (sec === "prod")
    body = picker("prod", R.RES_KEYS) +
      `<div class="line wrap sub"><span class="bw-comment">Plus</span>${numIn("scale.n", "Scaling amount")}
      ${sel("scale.res", R.RES, "resource", "Scaling resource")}<span class="bw-comment">per</span>${sel("scale.per", R.TYPES, "card type", "Per card type")}</div>`;
  if (sec === "corr") body = picker("corr", R.RES_KEYS);
  if (sec === "bonus")
    body = `<span class="bw-comment">Construction bonus</span>${picker("bonus", ["fin", "gen", "kry"])}
      <span class="bw-comment sub">Recycling bonus</span><div class="ctabs">${R.RES.map((r) => `<button type="button" class="ctab" data-act="recycle" data-k="${r.k}" aria-pressed="${d.recycle === r.k}">${chip(r.c)}${r.label}</button>`).join("")}</div>`;
  if (sec === "vp")
    body = (emp ? "" : `<span class="bw-comment">Printed VP</span>${cubeRow("vp", "", "VP")}`) +
      `<div class="line wrap sub">${numIn("combo.x", "VP each")}<span class="bw-comment">VP per</span>${sel("combo.t", targets, "none", "Scoring target")}</div>` +
      (g.exp.ca && !emp
        ? `<div class="line wrap">${numIn("duo.x", "VP per duo")}<span class="bw-comment">VP per duo of</span>${sel("duo.a", targets, "none", "Duo first type")}<span class="bw-comment">+</span>${sel("duo.b", targets, "none", "Duo second type")}</div>`
        : "");
  return `${sheetHead(`${emp ? "Empire" : "Log card"} · ${esc(R.playerName(g, d.player))} · round ${g.round}`)}
    ${emp ? "" : `<div class="typegrid">${R.TYPES.map((t) => `<button type="button" data-act="type" data-k="${t.k}" aria-pressed="${d.type === t.k}">${chip(t.c)}${t.label}</button>`).join("")}</div>`}
    <div class="secs" role="tablist">${secs.map((k) => { const n = filled(k); return `<button type="button" role="tab" data-act="sec" data-k="${k}" aria-selected="${k === sec}">${SEC[k]}${n ? `<b class="bw-mono">${n}</b>` : ""}</button>`; }).join("")}</div>
    <div class="sh-body">${body}</div>
    <div class="sh-foot"><p class="sum">${esc(R.cardSummary(d))}</p>${btn(emp ? "Save empire" : "Log card", "saveCard", { v: "primary" })}</div>`;
}

function renderLog(g) {
  let h = "";
  [4, 3, 2, 1].forEach((r) => {
    const ev = g.log.filter((e) => e.round === r);
    if (!ev.length) return;
    h += `<h3 class="hround">Round ${r}</h3><ul class="hlist">`;
    ev.slice().reverse().forEach((e) => {
      let main;
      let sub;
      const who = esc(R.playerName(g, e.player));
      if (e.kind === "build") [main, sub] = [`${who} · ${R.typeLabel(e.card.type)}`, R.cardSummary(e.card)];
      else if (e.kind === "award") [main, sub] = [`${who} · ${R.resLabel(e.res)} supremacy`, `+1 ${R.TOK[e.token].label}`];
      else [main, sub] = [`${who} · ${R.TOK[e.token].label} ${e.n > 0 ? "+1" : "−1"}`, "Manual adjustment"];
      h += `<li><div>${main}<small>${esc(sub)}</small></div>${btn("Remove", "delEvent", { v: "quiet", sm: true, data: `data-id="${e.id}"` })}</li>`;
    });
    h += "</ul>";
  });
  return `${sheetHead("Round history")}<div class="sh-body">${h || '<p class="bw-comment">Nothing logged yet. Pick a player and tap Log card.</p>'}</div>
    <div class="sh-foot">${btn("Undo last", "undo")}</div>`;
}

/* Score keypad: a number pad in a bottom sheet, so the phone keyboard never covers the page. */
function openPad(key) {
  const p = active();
  const v = p.s[key] || {};
  const c = R.CATS.find((x) => x.k === key);
  ui.pad = { key, field: c.kind === "mult" ? "n" : "v", vals: { ...v }, fresh: true };
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
  const c = R.CATS.find((x) => x.k === pad.key);
  const v = pad.vals;
  const f = (k, label) =>
    `<button type="button" class="pf" data-act="padField" data-k="${k}" aria-pressed="${pad.field === k}" aria-label="${label}"><span>${label}</span><b class="bw-mono">${v[k] ?? ""}</b></button>`;
  let fields;
  if (c.kind === "mult") fields = `${f("n", "Count")}<span class="bw-mono x">×</span>${f("x", "VP each")}`;
  else if (c.kind === "signed") fields = `${btn(v.neg ? "−" : "+", "padSign", { cls: `sign${v.neg ? " neg" : ""}`, aria: v.neg ? "Penalty. Switch to bonus." : "Bonus. Switch to penalty." })}${f("v", "VP")}`;
  else fields = f("v", "VP");
  const sub = R.catValue({ s: { [c.k]: v } }, c);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"]
    .map((k) => btn(k === "clear" ? "Clear" : k === "del" ? "Delete" : k, "padKey", { data: `data-k="${k}"`, cls: "key" }))
    .join("");
  const cats = R.activeCats(g);
  const last = cats[cats.length - 1].k === c.k && (c.kind !== "mult" || pad.field === "x");
  return `${sheetHead(`${chip(c.c, c.round)}${c.label} · ${esc(active().name || "Unnamed")}`)}
    <p class="bw-comment small">${c.note}</p>
    <div class="pfields">${fields}<span class="bw-mono eq">= ${sub}</span></div>
    <div class="keys">${keys}</div>
    <div class="sh-foot">${btn("Next", "padNext", { disabled: last })}${btn("Done", "close", { v: "primary" })}</div>`;
}

/* ---------- actions ---------- */
const acts = {
  round: (el) => dispatch({ type: "setRound", round: +el.dataset.n }),
  tokpref: (el) => dispatch({ type: "setTokPref", res: el.dataset.res, token: game().tokPref[el.dataset.res] === "fin" ? "gen" : "fin" }),
  pick: (el) => {
    ui.active = el.dataset.id;
    saveUi();
    render();
  },
  award: (el) => {
    const g = game();
    const res = el.dataset.res;
    const L = R.leaderOf(g.players.map((p) => ({ p, s: R.stats(g, p) })), res);
    if (L.who.length !== 1) return;
    dispatch({ type: "log", event: { id: uid(), t: Date.now(), round: g.round, kind: "award", player: L.who[0].id, res, token: g.tokPref[res] } });
    toast(`${L.who[0].name}: +1 ${R.TOK[g.tokPref[res]].label}`);
  },
  adj: (el) => dispatch({ type: "log", event: { id: uid(), t: Date.now(), round: game().round, kind: "adj", player: active().id, token: el.dataset.k, n: +el.dataset.n } }),
  newCard: () => {
    ui.draft = blankDraft("structure");
    ui.sheet = "card";
    saveUi();
    render();
  },
  empire: () => {
    const old = game().log.find((x) => x.kind === "build" && x.player === active().id && x.card.type === "empire");
    ui.draft = Object.assign(blankDraft("empire"), old ? structuredClone(old.card) : {}, { player: active().id, tab: {}, custom: {} });
    ui.sheet = "card";
    saveUi();
    render();
  },
  undo: () => {
    const log = game().log;
    if (!log.length) return toast("Nothing to undo.");
    const latest = log.reduce((a, e) => (e.t > a.t ? e : a), log[0]);
    dispatch({ type: "deleteEvent", id: latest.id });
    toast("Removed the last entry.");
  },
  showLog: () => {
    ui.sheet = "log";
    render();
  },
  delEvent: (el) => arm(el, () => dispatch({ type: "deleteEvent", id: el.dataset.id }), "Remove"),
  close: () => closeSheet(),
  type: (el) => {
    ui.draft.type = el.dataset.k;
    saveUi();
    renderSheet();
  },
  sec: (el) => {
    ui.draft.sec = el.dataset.k;
    saveUi();
    renderSheet();
  },
  ctab: (el) => {
    ui.draft.tab[el.dataset.sec] = el.dataset.k;
    renderSheet();
  },
  cube: (el) => {
    delete ui.draft.custom[el.dataset.path];
    set(ui.draft, el.dataset.path, +el.dataset.n);
    saveUi();
    renderSheet();
  },
  customCube: (el) => {
    ui.draft.custom[el.dataset.path] = true;
    renderSheet();
    const inp = $("#sheet .custom-in");
    if (inp) inp.focus();
  },
  recycle: (el) => {
    ui.draft.recycle = ui.draft.recycle === el.dataset.k ? "" : el.dataset.k;
    saveUi();
    renderSheet();
  },
  saveCard: () => {
    const d = ui.draft;
    const card = structuredClone(d);
    ["player", "tab", "custom", "sec"].forEach((k) => delete card[k]);
    const event = { id: uid(), t: Date.now(), round: game().round, kind: "build", player: d.player, card };
    dispatch(d.type === "empire" ? { type: "setEmpire", event } : { type: "log", event });
    toast(`Logged ${R.typeLabel(card.type)} for ${R.playerName(game(), d.player)}.`);
    closeSheet();
  },
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
    let next = cur;
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
    const c = R.CATS.find((x) => x.k === pad.key);
    if (c.kind === "mult" && pad.field === "n") {
      pad.field = "x";
      pad.fresh = true;
      return renderSheet();
    }
    commitPad();
    const cats = R.activeCats(game());
    const i = cats.findIndex((x) => x.k === pad.key);
    if (cats[i + 1]) openPad(cats[i + 1].k);
  },
  fill: (el) => arm(el, () => {
    dispatch({ type: "fillScorePad" });
    toast("Score pad filled from the tracker.");
  }, "Replace base rows?"),
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
  newGame: async (el) => {
    try {
      const body = el.dataset.blank || !app.gameId ? {} : { from: app.gameId };
      const g = await api("/api/games", { method: "POST", body });
      ui = { active: null, draft: null };
      go(`/games/${g.id}/setup`);
    } catch {
      toast("Starting a game needs the server. Check the connection.");
    }
  },
  forget: async (el) => {
    await api(`/api/roster/${encodeURIComponent(el.dataset.name)}`, { method: "DELETE" }).catch(() => {});
    loadGames();
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
  const fn = acts[el.dataset.act] || ((x) => guideAct(x, render));
  fn(el, e);
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.act === "draftNum") {
    const digits = t.value.replace(/\D/g, "").slice(0, 3);
    if (digits !== t.value) t.value = digits;
    set(ui.draft, t.dataset.path, digits === "" ? "" : parseInt(digits, 10));
    saveUi();
  }
});
document.addEventListener("change", (e) => {
  const t = e.target;
  const act = t.dataset.act;
  if (act === "draftSel") {
    set(ui.draft, t.dataset.path, t.value);
    saveUi();
    renderSheet();
  } else if (act === "draftNum") renderSheet();
  else if (act === "rename") dispatch({ type: "renamePlayer", id: t.dataset.id, name: t.value.trim() });
  else if (act === "exp") dispatch({ type: "setExp", id: t.dataset.id, on: t.checked });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.sheet) closeSheet();
  if (e.key === "Enter" && e.target.dataset.act === "rename") e.target.blur();
  if (ui.sheet === "pad" && /^[0-9]$|^Backspace$/.test(e.key)) {
    const k = e.key === "Backspace" ? "del" : e.key;
    acts.padKey({ dataset: { k } });
  }
});
window.addEventListener("popstate", route);
window.addEventListener("online", () => app.store && app.store.flush());

buildHeader();
api("/api/me")
  .then((m) => {
    app.me = m.user;
    renderPrompt();
  })
  .catch(() => {});
route();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
