// Every change to a game is an op. The browser applies ops optimistically and the
// server applies the same ops to the stored game, so devices never conflict.
// Every op is idempotent: applying one twice leaves the game as applying it once.

import { CATS, CAT_KEYS, EXPANSIONS, RES_KEYS, TYPE_KEYS, fillScorePad, freshGame, maxPlayers } from "./rules.js";

const OPS_KEPT = 500;
const int = (v, lo = 0, hi = 999) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;
};
const str = (v, max = 40) => String(v == null ? "" : v).slice(0, max);
const id = (v) => str(v, 32).replace(/[^\w-]/g, "");

function numMap(o, keys) {
  const out = {};
  if (o && typeof o === "object") keys.forEach((k) => { const n = int(o[k]); if (n) out[k] = n; });
  return out;
}
const TARGETS = TYPE_KEYS.concat(["fin", "gen"]);
const pickKey = (v, keys) => (keys.includes(v) ? v : "");

export function sanitizeCard(c) {
  c = c && typeof c === "object" ? c : {};
  const type = c.type === "empire" || TYPE_KEYS.includes(c.type) ? c.type : "structure";
  const scale = c.scale || {};
  const combo = c.combo || {};
  const duo = c.duo || {};
  return {
    type,
    cost: numMap(c.cost, RES_KEYS.concat(["kry", "fin", "gen"])),
    prod: numMap(c.prod, RES_KEYS),
    corr: numMap(c.corr, RES_KEYS),
    scale: { res: pickKey(scale.res, RES_KEYS), per: pickKey(scale.per, TYPE_KEYS), n: int(scale.n) },
    bonus: numMap(c.bonus, ["fin", "gen", "kry"]),
    recycle: pickKey(c.recycle, RES_KEYS),
    vp: int(c.vp),
    combo: { t: pickKey(combo.t, TARGETS), x: int(combo.x) },
    duo: { a: pickKey(duo.a, TARGETS), b: pickKey(duo.b, TARGETS), x: int(duo.x) },
  };
}

function sanitizeEvent(e, game) {
  if (!e || typeof e !== "object") return null;
  const base = { id: id(e.id), t: int(e.t, 0, Number.MAX_SAFE_INTEGER), round: int(e.round, 1, 4) || 1, player: id(e.player) };
  if (!base.id || !game.players.some((p) => p.id === base.player)) return null;
  if (e.kind === "build") return { ...base, kind: "build", card: sanitizeCard(e.card) };
  if (e.kind === "award" && RES_KEYS.includes(e.res) && (e.token === "fin" || e.token === "gen"))
    return { ...base, kind: "award", res: e.res, token: e.token };
  if (e.kind === "adj" && (e.token === "fin" || e.token === "gen"))
    return { ...base, kind: "adj", token: e.token, n: e.n < 0 ? -1 : 1 };
  return null;
}

function sanitizeCat(key, v) {
  const cat = CATS.find((c) => c.k === key);
  if (!cat || !v || typeof v !== "object") return {};
  const out = {};
  if (cat.kind === "mult") {
    if (v.n != null && v.n !== "") out.n = int(v.n, 0, 9999);
    if (v.x != null && v.x !== "") out.x = int(v.x, 0, 9999);
  } else {
    if (v.v != null && v.v !== "") out.v = int(v.v, 0, 9999);
    if (cat.kind === "signed" && v.neg) out.neg = true;
  }
  return out;
}

/** Fills in anything an older or partial game is missing. Mutates and returns it. */
export function normalizeGame(game) {
  const fresh = freshGame();
  game = game && typeof game === "object" ? game : fresh;
  game.exp = Object.assign({}, fresh.exp, game.exp);
  game.tokPref = Object.assign({}, fresh.tokPref, game.tokPref);
  if (!Array.isArray(game.players) || !game.players.length) game.players = fresh.players;
  if (!Array.isArray(game.log)) game.log = [];
  game.round = int(game.round, 1, 4) || 1;
  if (!Array.isArray(game._ops)) game._ops = [];
  return game;
}

/** Applies one op to a game in place. Unknown or invalid ops change nothing. */
export function applyOp(game, op) {
  if (!op || typeof op !== "object") return game;
  if (op.opId && game._ops && game._ops.includes(op.opId)) return game;
  const player = (pid) => game.players.find((p) => p.id === pid);
  switch (op.type) {
    case "addPlayer": {
      const pid = id(op.id);
      if (pid && !player(pid) && game.players.length < maxPlayers(game))
        game.players.push({ id: pid, name: str(op.name), s: {} });
      break;
    }
    case "renamePlayer": {
      const p = player(op.id);
      if (p) p.name = str(op.name);
      break;
    }
    case "removePlayer": {
      if (game.players.length > 1 && player(op.id)) {
        game.players = game.players.filter((p) => p.id !== op.id);
        game.log = game.log.filter((e) => e.player !== op.id);
      }
      break;
    }
    case "setCat": {
      const p = player(op.player);
      if (p && CAT_KEYS.includes(op.key)) p.s[op.key] = sanitizeCat(op.key, op.value);
      break;
    }
    case "clearScores": {
      const p = player(op.player);
      if (p) p.s = {};
      break;
    }
    case "setRound":
      game.round = int(op.round, 1, 4) || game.round;
      break;
    case "setExp":
      if (EXPANSIONS.some((e) => e.id === op.id)) game.exp[op.id] = !!op.on;
      break;
    case "setTokPref":
      if (RES_KEYS.includes(op.res) && (op.token === "fin" || op.token === "gen")) game.tokPref[op.res] = op.token;
      break;
    case "log": {
      const e = sanitizeEvent(op.event, game);
      if (e && !game.log.some((x) => x.id === e.id)) game.log.push(e);
      break;
    }
    case "setEmpire": {
      const e = sanitizeEvent(op.event, game);
      if (e && e.kind === "build") {
        e.card.type = "empire";
        e.round = 1;
        game.log = game.log.filter((x) => !(x.kind === "build" && x.player === e.player && x.card.type === "empire"));
        game.log.unshift(e);
      }
      break;
    }
    case "deleteEvent":
      game.log = game.log.filter((e) => e.id !== op.id);
      break;
    case "fillScorePad":
      fillScorePad(game);
      break;
    default:
      return game;
  }
  if (op.opId) {
    game._ops.push(id(op.opId));
    if (game._ops.length > OPS_KEPT) game._ops.splice(0, game._ops.length - OPS_KEPT);
  }
  return game;
}
