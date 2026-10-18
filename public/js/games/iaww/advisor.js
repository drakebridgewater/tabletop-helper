// It's a Wonderful World card picker: which drafted card to take, and whether
// to build or recycle it. Pure functions, shared by the browser and the tests.
//
// A training aid, not a solver. Each card is scored in VP from a few rough
// rates, and the reason names the parts that decided it.

import { RES_KEYS, TYPE_KEYS, TOK, resLabel, typeLabel } from "./rules.js";

export const CUBE_VP = 0.5;   // a cube is worth about half a VP once spent on a card
export const SPEND = 0.5;     // share of a card's cube cost counted against building it
export const KRY_CUBES = 5;   // 1 Krystallium is 5 spare cubes
export const START_RATE = 3;  // cards built per round, before a player has any history
export const NARROW = 0.7;    // weight of a supremacy lead of only 1
export const TOKEN_EARLY = 0.6; // share kept when a Financier or General cost is not yet in hand
export const TOKEN_LATE = 0.2;  // the same in the last round

const r1 = (n) => Math.round(n * 10) / 10;
const sum = (o) => Object.values(o || {}).reduce((a, n) => a + n, 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- VP of a player's tableau ---------- */
function copyState(s) {
  return {
    counts: { ...s.counts },
    tok: { ...s.tok },
    mult: { ...s.mult },
    gross: s.gross,
    duos: s.duos.map((d) => ({ a: d.a, b: d.b, x: d.x })),
  };
}
function addCard(st, c) {
  if (TYPE_KEYS.includes(c.type)) st.counts[c.type] += 1;
  st.gross += c.vp || 0;
  if (c.combo && c.combo.t && c.combo.x) st.mult[c.combo.t] += c.combo.x;
  if (c.duo && c.duo.a && c.duo.b && c.duo.x) st.duos.push({ a: c.duo.a, b: c.duo.b, x: c.duo.x });
  ["fin", "gen"].forEach((k) => (st.tok[k] = Math.max(0, st.tok[k] + ((c.bonus || {})[k] || 0) - ((c.cost || {})[k] || 0))));
  return st;
}
// The same sum as stats().vp. `exact` floors duo pairs; projections keep fractions.
export function vpOf(st, ca, exact = true) {
  const cnt = (k) => (k === "fin" || k === "gen" ? st.tok[k] : st.counts[k] || 0);
  let vp = st.gross + TYPE_KEYS.reduce((a, t) => a + st.mult[t] * st.counts[t], 0) + st.tok.fin * (1 + st.mult.fin) + st.tok.gen * (1 + st.mult.gen);
  if (ca)
    vp += st.duos.reduce((a, d) => {
      const n = d.a === d.b ? cnt(d.a) / 2 : Math.min(cnt(d.a), cnt(d.b));
      return a + (exact ? Math.floor(n) : n) * d.x;
    }, 0);
  return vp;
}

/* ---------- production ---------- */
// What building `c` adds to each resource per round, including scaling cards
// already built that count its type.
export function prodDelta(me, c) {
  const d = {};
  RES_KEYS.forEach((k) => (d[k] = ((c.prod || {})[k] || 0) - ((c.corr || {})[k] || 0)));
  const sc = c.scale || {};
  if (sc.res && sc.per && sc.n) d[sc.res] += sc.n * ((me.counts[sc.per] || 0) + (c.type === sc.per ? 1 : 0));
  me.cards.forEach((o) => {
    const s = o.scale || {};
    if (s.res && s.n && s.per === c.type) d[s.res] += s.n;
  });
  RES_KEYS.forEach((k) => (d[k] = Math.max(-me.prod[k], d[k])));
  return d;
}

// Sole leader of a resource: margin over the best opponent, or 0 when not leading.
function margin(mine, opps, res) {
  const best = Math.max(0, ...opps.map((o) => o.prod[res] || 0));
  return mine > best ? mine - best : 0;
}

/* ---------- affordability ---------- */
// Cubes left to come for each resource this game, plus some slack for
// recycling and Krystallium. Returns the share of the card's value to count,
// and the resource that blocks it most.
export function affordability(me, c, round) {
  const phases = 5 - round; // production phases left, this round included
  const slack = 2 * phases;
  let short = 0;
  let worst = null;
  RES_KEYS.forEach((k) => {
    const need = (c.cost || {})[k] || 0;
    const gap = need - me.prod[k] * phases;
    if (gap > 0) {
      short += gap;
      if (!worst || gap > worst.gap) worst = { res: k, need, have: me.prod[k], gap };
    }
  });
  short += 2 * ((c.cost || {}).kry || 0);
  let f = short > 0 ? slack / (slack + short) : 1;
  const tokShort = ["fin", "gen"].filter((k) => ((c.cost || {})[k] || 0) > me.tok[k]);
  // Tokens still come from supremacy and bonuses while rounds remain.
  if (tokShort.length) f *= phases > 1 ? TOKEN_EARLY : TOKEN_LATE;
  return { f, worst, tokShort };
}

/* ---------- one card ---------- */
function scoreCard(ctx, c) {
  const { me, round, opps, tokPref, ca, now, proj } = ctx;
  const prodRounds = 4 - round; // a card drafted now produces from next round on
  const supRounds = 5 - round;  // supremacy left for leads already held

  // VP now, and by game end once the expected further cards are built.
  const vpNow = vpOf(addCard(copyState(now), c), ca) - vpOf(now, ca);
  const vpEnd = vpOf(addCard(copyState(proj), c), ca, false) - vpOf(proj, ca, false);

  // Production over the rounds left.
  const dp = prodDelta(me, c);
  const prodCubes = sum(dp) * prodRounds;
  const prodVP = prodCubes * CUBE_VP;

  // Supremacy won or lost.
  const after = copyState(now);
  addCard(after, c);
  const sup = [];
  RES_KEYS.forEach((k) => {
    if (!dp[k]) return;
    const was = margin(me.prod[k], opps, k);
    const is = margin(me.prod[k] + dp[k], opps, k);
    if (!was === !is) return;
    const tok = tokPref[k] || "gen";
    const each = 1 + after.mult[tok];
    const w = is === 1 ? NARROW : 1;
    sup.push({ res: k, tok, gain: is > 0, vp: (is > 0 ? 1 : -1) * each * prodRounds * w, narrow: is === 1 });
  });
  const supVP = sup.reduce((a, s) => a + s.vp, 0);

  const cost = c.cost || {};
  const cubes = RES_KEYS.reduce((a, k) => a + (cost[k] || 0), 0) + KRY_CUBES * (cost.kry || 0);
  const costVP = cubes * CUBE_VP * SPEND;
  const aff = affordability(me, c, round);
  const build = (vpEnd + prodVP + supVP) * aff.f - costVP;

  // Recycling gives 1 cube now; one you do not produce is worth double.
  const rr = c.recycle;
  const scarce = rr && me.prod[rr] === 0;
  const recycle = rr ? CUBE_VP * (scarce ? 2 : 1) : 0;

  const parts = { build: r1(build), vpNow: r1(vpNow), vpEnd: r1(vpEnd), prod: dp, prodRounds, prodVP: r1(prodVP), sup, supVP: r1(supVP), cubes, costVP: r1(costVP), afford: r1(aff.f), recycle: r1(recycle) };
  const action = !rr || build >= recycle ? "build" : "recycle";
  return { card: c, action, score: r1(Math.max(build, recycle)), build: r1(build), recycle: r1(recycle), parts, reason: explain(c, action, parts, aff, scarce, opps, me) };
}

/* ---------- plain-language reasons ---------- */
function vpText(p) {
  const now = Math.round(p.vpNow);
  const end = Math.round(p.vpEnd);
  if (end > now) return now > 0 ? `${now} VP now, about ${end} by game end` : `about ${end} VP by game end`;
  return now > 0 ? `${now} VP` : "";
}
function prodText(p) {
  const up = RES_KEYS.filter((k) => p.prod[k] > 0).map((k) => `${p.prod[k]} ${resLabel(k).toLowerCase()}`);
  if (!up.length || !p.prodRounds) return "";
  return `+${up.join(", ")} a round for ${plural(p.prodRounds, "round")}`;
}
function supText(s, opps, me) {
  const r = resLabel(s.res).toLowerCase();
  if (!s.gain) return `loses ${r} supremacy`;
  // Name the opponent who led or tied before.
  const best = opps.reduce((a, o) => (!a || (o.prod[s.res] || 0) > (a.prod[s.res] || 0) ? o : a), null);
  const top = best ? best.prod[s.res] || 0 : 0;
  const from = top > 0 && top >= me.prod[s.res] && best.name ? ` from ${best.name}` : "";
  return `wins ${r} supremacy${from}${s.narrow ? " by 1" : ""}, +1 ${TOK[s.tok].label} a round`;
}
function costText(aff, c, me) {
  const bits = aff.tokShort.map((k) => `${plural(c.cost[k], TOK[k].label)} (you have ${me.tok[k]})`);
  if (aff.worst) bits.push(`${aff.worst.need} ${resLabel(aff.worst.res).toLowerCase()} and you make ${aff.worst.have}`);
  return bits.length ? "needs " + bits.join(", and ") : "";
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function explain(c, action, p, aff, scarce, opps, me) {
  if (action === "recycle") {
    const why = p.afford < 0.8 ? `building it ${costText(aff, c, me)}` : `building it nets only about ${Math.max(0, Math.round(p.build))} VP after its cost`;
    return `For 1 ${resLabel(c.recycle).toLowerCase()}${scarce ? ", which you do not produce" : ""}; ${why}.`;
  }
  const bits = [];
  const v = vpText(p);
  const pr = prodText(p);
  const ranked = [
    [v, p.vpEnd],
    [pr, p.prodVP],
    ...p.sup.map((s) => [supText(s, opps, me), Math.abs(s.vp)]),
  ].filter(([t]) => t).sort((a, b) => b[1] - a[1]);
  ranked.slice(0, 2).forEach(([t]) => bits.push(t));
  if (!bits.length) bits.push(`a ${typeLabel(c.type).toLowerCase()} for your counts`);
  if (p.afford < 0.8) bits.push(costText(aff, c, me));
  return cap(bits.join("; ")) + ".";
}

/* ---------- the hand ---------- */
// me: stats() for the player choosing. opps: [{ name, prod }] for everyone else.
// hand: tracker cards (sanitizeCard). Returns the hand ranked best first, each
// with its index in the hand, the action, a VP-scale score and a reason.
export function advise({ me, round = 1, opps = [], tokPref = {}, ca = false, hand = [] }) {
  round = Math.min(4, Math.max(1, round | 0 || 1));
  const now = copyState(me);
  // Expected further builds this game, spread over types in proportion to what
  // the player already builds, and supremacy tokens from leads already held.
  const rate = round > 1 && me.built ? Math.max(1, me.built / (round - 1)) : START_RATE;
  const more = rate * (4.5 - round);
  const proj = copyState(me);
  TYPE_KEYS.forEach((t) => (proj.counts[t] += (more * (me.counts[t] + 1)) / (me.built + TYPE_KEYS.length)));
  RES_KEYS.forEach((k) => {
    if (margin(me.prod[k], opps, k)) proj.tok[tokPref[k] || "gen"] += 5 - round;
  });
  const ctx = { me, round, opps, tokPref, ca, now, proj };
  return hand
    .map((c, i) => ({ i, ...scoreCard(ctx, c) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
}

// A card's printed name, or its type and a letter for one entered by hand.
export const cardLabel = (c, i) => c.name || `${typeLabel(c.type)} ${String.fromCharCode(65 + i)}`;
