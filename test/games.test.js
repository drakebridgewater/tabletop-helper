import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, getDef, tier } from "../public/js/games/index.js";
import { applyOp, freshGame, normalizeGame } from "../public/js/core/reducer.js";
import { rankPlayers, total } from "../public/js/core/score.js";

const KINDS = ["flat", "minus", "signed", "mult", "count"];
const defs = CATALOG.filter((g) => g.def).map((g) => g.def);

test("catalog slugs are unique and URL-safe", () => {
  const slugs = CATALOG.map((g) => g.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  slugs.forEach((s) => assert.match(s, /^[a-z0-9-]+$/, s));
  // A slug must never look like a session id.
  slugs.forEach((s) => assert.doesNotMatch(s, /^\d+$/, s));
});

for (const def of defs) {
  test(`${def.slug}: definition is well formed`, () => {
    assert.ok(getDef(def.slug) === def);
    assert.ok(def.name);
    if (def.guide) {
      assert.ok(def.guide.start.length, "guide.start");
      def.guide.start.forEach((s) => assert.ok(s.h && s.items.length));
      if (def.guide.order) {
        const rounds = def.guide.order.rounds || 1;
        for (let r = 1; r <= rounds; r++) def.guide.order.steps(r).forEach((s) => assert.ok(s.h && s.p.length, `${def.slug} round ${r}`));
      }
    }
    if (def.score) {
      const keys = def.score.cats.map((c) => c.k);
      assert.equal(new Set(keys).size, keys.length, "category keys are unique");
      def.score.cats.forEach((c) => {
        assert.ok(KINDS.includes(c.kind), `${c.k} kind`);
        if (c.kind === "count") assert.ok(Number.isInteger(c.each), `${c.k} each`);
        if (c.g && c.g !== "base" && c.g !== "other") assert.ok((def.options || []).some((o) => o.id === c.g), `${c.k} option ${c.g}`);
      });
    }
    assert.notEqual(tier(def), "none");
  });
}

test("a score pad game totals and ranks with no game-specific code", () => {
  const def = getDef("ticket-to-ride");
  const g = normalizeGame(freshGame(def), def);
  applyOp(g, { type: "setCat", player: "p1", key: "r6", value: { n: 2 } }, def);
  applyOp(g, { type: "setCat", player: "p1", key: "failed", value: { v: 9 } }, def);
  applyOp(g, { type: "setCat", player: "p2", key: "r3", value: { n: 3 } }, def);
  applyOp(g, { type: "setCat", player: "p2", key: "longest", value: { n: 1 } }, def);
  assert.equal(total(g, def, g.players[0]), 30 - 9);
  assert.equal(total(g, def, g.players[1]), 12 + 10);
  assert.equal(rankPlayers(g, def)[0].p.id, "p2");
});

test("option categories count only while the option is on", () => {
  const def = getDef("wingspan");
  const g = normalizeGame(freshGame(def), def);
  applyOp(g, { type: "setCat", player: "p1", key: "nectar", value: { v: 5 } }, def);
  assert.equal(total(g, def, g.players[0]), 0);
  applyOp(g, { type: "setExp", id: "oceania", on: true }, def);
  assert.equal(total(g, def, g.players[0]), 5);
});

test("player limits come from the game", () => {
  const def = getDef("ticket-to-ride");
  const g = normalizeGame(freshGame(def), def);
  for (let i = 3; i <= 9; i++) applyOp(g, { type: "addPlayer", id: `p${i}`, name: `P${i}` }, def);
  assert.equal(g.players.length, 5);
});
