// It's a Wonderful World tracker screens: the production table, the card form
// and the round history. Browser only; app.js installs this when an IAWW
// session opens and hands it the session context.

import * as Rules from "./rules.js";
import { playerName } from "../../core/score.js";
import { uid } from "../../core/store.js";
import { $, esc, chip, btn, icon, initials } from "../../core/ui.js";

const R = { ...Rules, playerName };

export default function install(ctx) {
  const { game, active, dispatch, ui, render, renderSheet, closeSheet, saveUi, toast, arm, sheetHead } = ctx;

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

  const acts = {
    round: (el) => dispatch({ type: "setRound", round: +el.dataset.n }),
    tokpref: (el) => dispatch({ type: "setTokPref", res: el.dataset.res, token: game().tokPref[el.dataset.res] === "fin" ? "gen" : "fin" }),
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
    fill: (el) => arm(el, () => {
      dispatch({ type: "fillScorePad" });
      toast("Score pad filled from the tracker.");
    }, "Replace base rows?"),
  };

  return {
    views: { tracker: renderTracker },
    sheets: {
      card: { render: renderCardForm, label: "Log a card" },
      log: { render: renderLog, label: "Round history" },
    },
    acts,
    // Shown under the score pad: copy the tracked totals into it.
    scoreActions: (g) => btn("Fill from tracker", "fill", { disabled: !g.log.length }),
    onInput(t) {
      if (t.dataset.act !== "draftNum") return false;
      const digits = t.value.replace(/\D/g, "").slice(0, 3);
      if (digits !== t.value) t.value = digits;
      set(ui.draft, t.dataset.path, digits === "" ? "" : parseInt(digits, 10));
      saveUi();
      return true;
    },
    onChange(t) {
      if (t.dataset.act === "draftSel") {
        set(ui.draft, t.dataset.path, t.value);
        saveUi();
        renderSheet();
        return true;
      }
      if (t.dataset.act === "draftNum") {
        renderSheet();
        return true;
      }
      return false;
    },
  };
}
