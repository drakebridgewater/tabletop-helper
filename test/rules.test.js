import { test } from "node:test";
import assert from "node:assert/strict";
import { stats, fillScorePad } from "../public/js/games/iaww/rules.js";
import { applyOp as apply, freshGame, normalizeGame } from "../public/js/core/reducer.js";
import { rankPlayers, total as sum } from "../public/js/core/score.js";
import def from "../public/js/games/iaww/def.js";

const applyOp = (g, op) => apply(g, op, def);
const total = (g, p) => sum(g, def, p);

const build = (player, card, id = Math.random().toString(36).slice(2)) => ({
  type: "log",
  event: { id, t: Date.now(), round: 1, kind: "build", player, card },
});

function game() {
  return normalizeGame(freshGame(def), def);
}

test("production adds card output, scaling and corruption, never below zero", () => {
  const g = game();
  applyOp(g, build("p1", { type: "structure", prod: { material: 2 } }));
  applyOp(g, build("p1", { type: "structure", prod: { energy: 1 } }));
  applyOp(g, build("p1", { type: "research", scale: { res: "science", per: "structure", n: 1 } }));
  g.exp.ca = true;
  applyOp(g, build("p1", { type: "vehicle", corr: { gold: 3 } }));
  const s = stats(g, g.players[0]);
  assert.equal(s.prod.material, 2);
  assert.equal(s.prod.energy, 1);
  assert.equal(s.prod.science, 2);
  assert.equal(s.prod.gold, 0);
  assert.equal(s.built, 4);
});

test("VP counts printed points, per-type multipliers and character tokens", () => {
  const g = game();
  applyOp(g, build("p1", { type: "project", vp: 5, combo: { t: "structure", x: 2 } }));
  applyOp(g, build("p1", { type: "structure", bonus: { fin: 2 } }));
  applyOp(g, build("p1", { type: "structure" }));
  const s = stats(g, g.players[0]);
  // 5 printed + 2 per structure x 2 structures + 2 financiers x 1
  assert.equal(s.vp, 5 + 4 + 2);
});

test("filling the score pad from the tracker matches the tracker VP", () => {
  const g = game();
  applyOp(g, build("p1", { type: "project", vp: 5, combo: { t: "fin", x: 3 } }));
  applyOp(g, build("p1", { type: "structure", bonus: { fin: 2 } }));
  fillScorePad(g);
  const p = g.players[0];
  assert.equal(total(g, p), stats(g, p).vp);
});

test("ranking breaks ties on cards built, then tokens", () => {
  const g = game();
  applyOp(g, { type: "setCat", player: "p1", key: "cards", value: { v: 10 } });
  applyOp(g, { type: "setCat", player: "p2", key: "cards", value: { v: 10 } });
  applyOp(g, build("p2", { type: "structure" }));
  const r = rankPlayers(g, def);
  assert.equal(r[0].p.id, "p2");
  assert.equal(r[0].rank, 1);
  assert.equal(r[1].rank, 2);
});

test("expansion rows only count while the expansion is on", () => {
  const g = game();
  applyOp(g, { type: "setCat", player: "p1", key: "wop", value: { v: 4, neg: true } });
  assert.equal(total(g, g.players[0]), 0);
  applyOp(g, { type: "setExp", id: "wop", on: true });
  assert.equal(total(g, g.players[0]), -4);
});
