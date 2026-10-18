import { test } from "node:test";
import assert from "node:assert/strict";
import { stats } from "../public/js/games/iaww/rules.js";
import { advise, vpOf, prodDelta, affordability, cardLabel } from "../public/js/games/iaww/advisor.js";
import { sanitizeCard } from "../public/js/games/iaww/def.js";
import { CARDS, toCard, cardsFor } from "../public/js/games/iaww/cards.js";
import { applyOp as apply, freshGame, normalizeGame } from "../public/js/core/reducer.js";
import def from "../public/js/games/iaww/def.js";

const applyOp = (g, op) => apply(g, op, def);
let n = 0;
const build = (g, player, card, round = 1) =>
  applyOp(g, { type: "log", event: { id: "e" + n++, t: n, round, kind: "build", player, card } });
const game = () => normalizeGame(freshGame(def), def);
const card = (c) => sanitizeCard(c);

// Everything advise() needs for player p1 of game g.
function inputs(g, round, hand) {
  const [me, ...rest] = g.players;
  return {
    me: stats(g, me),
    round,
    opps: rest.map((p) => ({ name: p.name, prod: stats(g, p).prod })),
    tokPref: g.tokPref,
    ca: !!g.exp.ca,
    hand: hand.map(card),
  };
}

test("vpOf matches stats().vp", () => {
  const g = game();
  build(g, "p1", { type: "project", vp: 3, combo: { t: "structure", x: 2 } });
  build(g, "p1", { type: "structure", bonus: { fin: 1 } });
  build(g, "p1", { type: "structure" });
  const s = stats(g, g.players[0]);
  assert.equal(vpOf(s, false), s.vp);
});

test("ranks printed VP above nothing, and gives each card a reason", () => {
  const g = game();
  const r = advise(inputs(g, 1, [{ type: "structure" }, { type: "project", vp: 5 }]));
  assert.equal(r[0].i, 1);
  assert.equal(r[0].action, "build");
  r.forEach((x) => assert.match(x.reason, /^[A-Z0-9].+\.$/));
  assert.match(r[0].reason, /5 VP/);
});

test("production is worth more early than late", () => {
  const g = game();
  const hand = [{ type: "structure", prod: { material: 2 } }];
  const early = advise(inputs(g, 1, hand))[0];
  const late = advise(inputs(g, 3, hand))[0];
  assert.ok(early.parts.prodVP > late.parts.prodVP);
  assert.equal(advise(inputs(g, 4, hand))[0].parts.prodVP, 0);
  assert.match(early.reason, /2 material a round for 3 rounds/);
});

test("a multiplier gains value from the cards it counts", () => {
  const g = game();
  build(g, "p1", { type: "research" });
  build(g, "p1", { type: "research" });
  const combo = { type: "project", combo: { t: "research", x: 2 } };
  const r = advise(inputs(g, 2, [combo]))[0];
  assert.equal(r.parts.vpNow, 4);
  assert.ok(r.parts.vpEnd > r.parts.vpNow, "more research is expected by game end");
  assert.match(r.reason, /4 VP now, about \d+ by game end/);
});

test("a card that wins a supremacy race scores the token over the rounds left", () => {
  const g = game();
  build(g, "p2", { type: "empire", prod: { energy: 2 } });
  build(g, "p1", { type: "empire", prod: { energy: 2 } });
  const hand = [{ type: "vehicle", prod: { energy: 1 } }, { type: "vehicle", prod: { gold: 1 } }];
  const r = advise(inputs(g, 2, hand));
  const energy = r.find((x) => x.i === 0);
  assert.equal(energy.parts.sup.length, 1);
  assert.ok(energy.parts.supVP > 0);
  assert.equal(r[0].i, 0, "breaking the tie beats the same production elsewhere");
  assert.match(energy.reason, /Wins energy supremacy from Player 2 by 1, \+1 General a round/);
});

test("an opponent who already out-produces you leaves no supremacy to win", () => {
  const g = game();
  build(g, "p2", { type: "empire", prod: { science: 5 } });
  const r = advise(inputs(g, 1, [{ type: "research", prod: { science: 1 } }]))[0];
  assert.equal(r.parts.sup.length, 0);
});

test("scaling production counts cards of its type, old and new", () => {
  const g = game();
  build(g, "p1", { type: "structure" });
  build(g, "p1", { type: "research", scale: { res: "science", per: "structure", n: 1 } });
  const me = stats(g, g.players[0]);
  // A new structure adds 1 science through the scaling card already built.
  assert.equal(prodDelta(me, card({ type: "structure" })).science, 1);
  // A second scaling card counts the structure already built.
  assert.equal(prodDelta(me, card({ type: "research", scale: { res: "science", per: "structure", n: 2 } })).science, 2);
});

test("a card you cannot pay for is recycled, late in the game", () => {
  const g = game();
  build(g, "p1", { type: "empire", prod: { material: 1 } });
  const big = { type: "project", vp: 4, cost: { science: 8 }, recycle: "science" };
  const r = advise(inputs(g, 4, [big]))[0];
  assert.equal(r.action, "recycle");
  assert.match(r.reason, /^For 1 science, which you do not produce; building it needs 8 science and you make 0\.$/);
  assert.ok(affordability(stats(g, g.players[0]), card(big), 4).f < 0.5);
});

test("a card that costs a Financier you lack is marked down", () => {
  const g = game();
  const me = stats(g, g.players[0]);
  const c = card({ type: "project", cost: { fin: 1 } });
  const early = affordability(me, c, 1);
  assert.ok(early.f < 1);
  assert.deepEqual(early.tokShort, ["fin"]);
  assert.ok(affordability(me, c, 4).f < 0.5, "little time left to earn it");
});

test("duos only count with Corruption & Ascension on", () => {
  const g = game();
  build(g, "p1", { type: "structure" });
  build(g, "p1", { type: "vehicle" });
  const duo = { type: "project", duo: { a: "structure", b: "vehicle", x: 3 } };
  assert.equal(advise(inputs(g, 2, [duo]))[0].parts.vpNow, 0);
  g.exp.ca = true;
  assert.equal(advise(inputs(g, 2, [duo]))[0].parts.vpNow, 3);
});

test("ties keep hand order, and hand-entered cards get a letter", () => {
  const g = game();
  const r = advise(inputs(g, 1, [{ type: "structure" }, { type: "structure" }]));
  assert.deepEqual(r.map((x) => x.i), [0, 1]);
  assert.equal(cardLabel(card({ type: "vehicle" }), 2), "Vehicle C");
  assert.equal(cardLabel(card({ type: "vehicle", name: "Zeppelin" }), 2), "Zeppelin");
});

test("recycle events log without changing any totals", () => {
  const g = game();
  build(g, "p1", { type: "structure", vp: 2 });
  const before = stats(g, g.players[0]).vp;
  applyOp(g, { type: "log", event: { id: "r1", t: 99, round: 1, kind: "recycle", player: "p1", res: "gold", card: { type: "project", vp: 9 } } });
  assert.equal(g.log.at(-1).kind, "recycle");
  assert.equal(stats(g, g.players[0]).vp, before);
  applyOp(g, { type: "log", event: { id: "r2", t: 99, round: 1, kind: "recycle", player: "p1", res: "nope" } });
  assert.equal(g.log.length, 2, "a recycle needs a resource");
});

test("card database entries survive the tracker's card cleaning", () => {
  assert.ok(CARDS.length > 0);
  // Blank fields ("", 0, empty objects) removed, so a missing field equals an empty one.
  const strip = (v) => {
    if (v === "" || v === 0 || v == null) return undefined;
    if (typeof v !== "object" || Array.isArray(v)) return v;
    const o = {};
    for (const [k, x] of Object.entries(v)) if (strip(x) !== undefined) o[k] = strip(x);
    return Object.keys(o).length ? o : undefined;
  };
  CARDS.forEach((e) => {
    assert.ok(e.name && Array.isArray(e.exp) && e.exp.length && e.n > 0, e.name);
    const c = strip(toCard(e));
    for (const k of ["type", "cost", "prod", "corr", "scale", "bonus", "recycle", "vp", "combo", "duo"]) assert.deepEqual(c[k], strip(e[k]), `${e.name}: ${k}`);
  });
});

test("the base game has its 150 development cards", () => {
  const base = CARDS.filter((c) => c.exp.length === 1 && c.exp[0] === "base");
  assert.equal(base.reduce((a, c) => a + c.n, 0), 150);
});

test("the card list follows the session's expansions", () => {
  const g = game();
  const sets = (list) => new Set(list.flatMap((c) => c.exp));
  assert.deepEqual([...sets(cardsFor(g))].sort(), ["base", "ks"]);
  g.exp.ca = true;
  assert.ok(sets(cardsFor(g)).has("ca"));
  assert.ok(!cardsFor(g).some((c) => c.exp.includes("ld")), "a ca+ld card needs both");
});

test("entering values narrows the card list like a satnav", async () => {
  const { matchCards, optionsFor } = await import("../public/js/games/iaww/cards.js");
  const list = [
    { name: "A", type: "structure", cost: { material: 2 }, prod: { material: 2 } },
    { name: "B", type: "structure", cost: { material: 2 }, prod: { energy: 1 } },
    { name: "C", type: "vehicle", cost: { energy: 2 } },
  ];
  assert.deepEqual(matchCards({ type: "structure" }, list).map((c) => c.name), ["A", "B"]);
  assert.deepEqual(matchCards({ type: "structure", cost: { material: 2 }, prod: { energy: 1 } }, list).map((c) => c.name), ["B"]);
  assert.deepEqual(matchCards({ type: "structure", cost: { material: 3 } }, list), []);
  // Material production can be 2 (A) or none (B); 1 matches nothing.
  assert.deepEqual([...optionsFor({ type: "structure" }, list, "prod.material")].sort(), [0, 2]);
  // The current type does not limit the type buttons, only the other fields do.
  assert.deepEqual([...optionsFor({ type: "structure", cost: { energy: 2 } }, list, "type")], ["vehicle"]);
  // Blank fields from the form count as not entered.
  assert.equal(matchCards({ type: "vehicle", vp: 0, scale: { res: "", per: "", n: 0 }, recycle: "" }, list).length, 1);
});
