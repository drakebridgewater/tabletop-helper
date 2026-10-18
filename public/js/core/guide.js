// Getting started and play order for any game, from its def.guide:
//   start: [{ h, items: [...] }]
//   order: { rounds: n | null, roundNote?(round), steps(round) => [{ h, short?, c?, p: [...] }] }
// The step-through remembers its place per game on this device.

import { local } from "./store.js";

const chip = (c) => (c ? `<i class="chip" style="--c:var(${c})"></i>` : "");
const pad2 = (n) => String(n).padStart(2, "0");
const posKey = (def) => `tabletop:guide:${def.slug}`;

export function renderGuide(def, sub, game) {
  const g = def.guide;
  const base = `/${def.slug}/guide`;
  const tabs = g.order
    ? `<nav class="subnav" aria-label="Guide">
    <a href="${base}"${sub !== "order" ? ' aria-current="page"' : ""}>Getting started</a>
    <a href="${base}/order"${sub === "order" ? ' aria-current="page"' : ""}>Play order</a></nav>`
    : "";
  if (sub !== "order" || !g.order) {
    return `<div class="guide">${tabs}${g.start
      .map(
        (s, i) => `<section><h2 class="h3"><span class="bw-secnum">${pad2(i + 1)}</span>${s.h}</h2>
        <ul class="glist">${s.items.map((t) => `<li>${t}</li>`).join("")}</ul></section>`,
      )
      .join("")}</div>`;
  }
  const rounds = g.order.rounds;
  const pos = local.get(posKey(def)) || { round: game && rounds ? Math.min(game.round, rounds) : 1, step: 0 };
  const list = g.order.steps(pos.round);
  pos.step = Math.min(pos.step, list.length - 1);
  const s = list[pos.step];
  const first = pos.step === 0 && (!rounds || pos.round === 1);
  const last = pos.step === list.length - 1 && (!rounds || pos.round === rounds);
  const roundRow = rounds
    ? `<div class="line"><span class="lbl">Round</span><div class="seg">${Array.from({ length: rounds }, (_, i) => i + 1)
        .map((n) => `<button type="button" class="bw-btn bw-btn--secondary bw-btn--sm" data-act="guideRound" data-n="${n}" aria-pressed="${pos.round === n}" aria-label="Round ${n}">${n}</button>`)
        .join("")}</div>${g.order.roundNote ? `<span class="bw-comment small">${g.order.roundNote(pos.round)}</span>` : ""}</div>`
    : "";
  const ol = list
    .map(
      (x, i) => `<li><button type="button" data-act="guideStep" data-n="${i}" aria-current="${i === pos.step ? "step" : "false"}">
      <span class="bw-mono n">${pad2(i + 1)}</span>${chip(x.c)}<span>${x.short || x.h}</span></button></li>`,
    )
    .join("");
  return `<div class="guide order">${tabs}${roundRow}
    <ol class="steps">${ol}</ol>
    <section class="bw-panel step" aria-live="polite"><h3>${chip(s.c)}${s.h}</h3>${s.p.map((t) => `<p>${t}</p>`).join("")}</section>
    <div class="acts">
      <button type="button" class="bw-btn bw-btn--secondary" data-act="guidePrev"${first ? " disabled" : ""}>Previous</button>
      <button type="button" class="bw-btn bw-btn--primary" data-act="guideNext"${last ? " disabled" : ""}>Next</button>
    </div></div>`;
}

/** Handles the guide's buttons. Returns false for any other action. */
export function guideAct(el, def, rerender) {
  const order = def.guide && def.guide.order;
  if (!order) return false;
  const rounds = order.rounds || 1;
  const pos = local.get(posKey(def)) || { round: 1, step: 0 };
  const last = order.steps(pos.round).length - 1;
  const a = el.dataset.act;
  if (a === "guideRound") Object.assign(pos, { round: +el.dataset.n, step: 0 });
  else if (a === "guideStep") pos.step = +el.dataset.n;
  else if (a === "guideNext") {
    if (pos.step < last) pos.step++;
    else if (pos.round < rounds) Object.assign(pos, { round: pos.round + 1, step: 0 });
  } else if (a === "guidePrev") {
    if (pos.step > 0) pos.step--;
    else if (pos.round > 1) Object.assign(pos, { round: pos.round - 1, step: order.steps(pos.round - 1).length - 1 });
  } else return false;
  local.set(posKey(def), pos);
  rerender();
  return true;
}
