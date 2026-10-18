// Every change to a session is an op. The browser applies ops optimistically and
// the server applies the same ops to the stored session, so devices never
// conflict. Every op is idempotent: applying one twice equals applying it once.
// Ops every scoring game shares live here; a game adds its own with def.applyOp.

import { maxPlayers } from "./score.js";

const OPS_KEPT = 500;
export const int = (v, lo = 0, hi = 999) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;
};
export const str = (v, max = 40) => String(v == null ? "" : v).slice(0, max);
export const id = (v) => str(v, 32).replace(/[^\w-]/g, "");

function sanitizeCat(cat, v) {
  if (!v || typeof v !== "object") return {};
  const out = {};
  const num = (k) => {
    if (v[k] != null && v[k] !== "") out[k] = int(v[k], 0, 9999);
  };
  if (cat.kind === "mult") ["n", "x"].forEach(num);
  else if (cat.kind === "count") num("n");
  else {
    num("v");
    if (cat.kind === "signed" && v.neg) out.neg = true;
  }
  return out;
}

export function freshGame(def, from) {
  const exp = {};
  (def.options || []).forEach((o) => (exp[o.id] = false));
  const players = from && from.players.length
    ? from.players.map((p) => ({ id: p.id, name: p.name, s: {} }))
    : Array.from({ length: Math.max(2, def.players ? def.players[0] : 2) }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, s: {} }));
  const game = { kind: def.slug, exp: Object.assign(exp, from ? from.exp : {}), players, round: 1, log: [] };
  if (def.init) def.init(game, from);
  return game;
}

/** Fills in anything an older or partial session is missing. Mutates and returns it. */
export function normalizeGame(game, def) {
  const fresh = freshGame(def);
  game = game && typeof game === "object" ? game : fresh;
  game.kind = def.slug;
  game.exp = Object.assign({}, fresh.exp, game.exp);
  if (!Array.isArray(game.players) || !game.players.length) game.players = fresh.players;
  if (!Array.isArray(game.log)) game.log = [];
  game.round = int(game.round, 1, 99) || 1;
  if (!Array.isArray(game._ops)) game._ops = [];
  if (def.normalize) def.normalize(game, fresh);
  return game;
}

/** Applies one op to a session in place. Unknown or invalid ops change nothing. */
export function applyOp(game, op, def) {
  if (!op || typeof op !== "object") return game;
  if (op.opId && game._ops && game._ops.includes(op.opId)) return game;
  const player = (pid) => game.players.find((p) => p.id === pid);
  switch (op.type) {
    case "addPlayer": {
      const pid = id(op.id);
      if (pid && !player(pid) && game.players.length < maxPlayers(game, def)) game.players.push({ id: pid, name: str(op.name), s: {} });
      break;
    }
    case "renamePlayer": {
      const p = player(op.id);
      if (p) p.name = str(op.name);
      break;
    }
    case "removePlayer":
      if (game.players.length > 1 && player(op.id)) {
        game.players = game.players.filter((p) => p.id !== op.id);
        game.log = game.log.filter((e) => e.player !== op.id);
      }
      break;
    case "setCat": {
      const p = player(op.player);
      const cat = def.score && def.score.cats.find((c) => c.k === op.key);
      if (p && cat) p.s[op.key] = sanitizeCat(cat, op.value);
      break;
    }
    case "clearScores": {
      const p = player(op.player);
      if (p) p.s = {};
      break;
    }
    case "setRound":
      game.round = int(op.round, 1, def.rounds || 99) || game.round;
      break;
    case "setExp":
      if ((def.options || []).some((o) => o.id === op.id)) game.exp[op.id] = !!op.on;
      break;
    default:
      if (!def.applyOp || !def.applyOp(game, op)) return game;
  }
  if (op.opId) {
    game._ops.push(id(op.opId));
    if (game._ops.length > OPS_KEPT) game._ops.splice(0, game._ops.length - OPS_KEPT);
  }
  return game;
}
