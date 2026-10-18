import { test } from "node:test";
import assert from "node:assert/strict";
import { freshGame } from "../public/js/rules.js";
import { applyOp, normalizeGame } from "../public/js/reducer.js";

const game = () => normalizeGame(freshGame());

test("every op is idempotent", () => {
  const ops = [
    { type: "addPlayer", id: "p3", name: "Ana" },
    { type: "renamePlayer", id: "p1", name: "Ben" },
    { type: "setCat", player: "p1", key: "structure", value: { n: 3, x: 2 } },
    { type: "setRound", round: 3 },
    { type: "setExp", id: "ca", on: true },
    { type: "setTokPref", res: "gold", token: "gen" },
    { type: "log", event: { id: "e1", t: 1, round: 1, kind: "award", player: "p1", res: "gold", token: "gen" } },
    { type: "setEmpire", event: { id: "e2", t: 2, kind: "build", player: "p2", card: { prod: { material: 3 } } } },
    { type: "deleteEvent", id: "e1" },
    { type: "fillScorePad" },
  ];
  const once = game();
  ops.forEach((op) => applyOp(once, op));
  const twice = game();
  ops.forEach((op) => {
    applyOp(twice, { ...op });
    applyOp(twice, { ...op });
  });
  delete once._ops;
  delete twice._ops;
  assert.deepEqual(twice, once);
});

test("an op id the game has already seen is skipped", () => {
  const g = game();
  const op = { opId: "abc", type: "log", event: { id: "x", t: 1, kind: "adj", player: "p1", token: "fin", n: 1 } };
  applyOp(g, op);
  applyOp(g, { ...op, event: { ...op.event, id: "y" } });
  assert.equal(g.log.length, 1);
});

test("bad input is cleaned or ignored", () => {
  const g = game();
  applyOp(g, { type: "log", event: { id: "z", kind: "build", player: "nobody", card: {} } });
  applyOp(g, { type: "log", event: { id: "z2", kind: "build", player: "p1", card: { type: "hack", prod: { material: -5, evil: 9 }, vp: 1e9 } } });
  applyOp(g, { type: "setCat", player: "p1", key: "__proto__", value: { v: 1 } });
  applyOp(g, { type: "nope" });
  assert.equal(g.log.length, 1);
  const card = g.log[0].card;
  assert.equal(card.type, "structure");
  assert.deepEqual(card.prod, {});
  assert.equal(card.vp, 999);
  assert.equal(Object.keys(g.players[0].s).length, 0);
});

test("player limits follow Corruption & Ascension", () => {
  const g = game();
  for (let i = 3; i <= 8; i++) applyOp(g, { type: "addPlayer", id: `p${i}`, name: `P${i}` });
  assert.equal(g.players.length, 5);
  applyOp(g, { type: "setExp", id: "ca", on: true });
  for (let i = 6; i <= 8; i++) applyOp(g, { type: "addPlayer", id: `p${i}`, name: `P${i}` });
  assert.equal(g.players.length, 7);
});

test("removing a player removes their log entries, but never the last player", () => {
  const g = game();
  applyOp(g, { type: "log", event: { id: "a", t: 1, kind: "adj", player: "p2", token: "gen", n: 1 } });
  applyOp(g, { type: "removePlayer", id: "p2" });
  assert.equal(g.log.length, 0);
  applyOp(g, { type: "removePlayer", id: "p1" });
  assert.equal(g.players.length, 1);
});
