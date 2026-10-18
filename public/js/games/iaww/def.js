// It's a Wonderful World: full tracker tier. Shared by the browser and the server;
// the tracker screens are in ./ui.js, which only the browser loads.

import { int, id } from "../../core/reducer.js";
import { CATS, EXPANSIONS, RES_KEYS, TYPE_KEYS, fillScorePad, stats } from "./rules.js";

const passDir = (round) => (round % 2 ? "left" : "right");
const PRODUCE = [
  ["Material", "--res-material"],
  ["Energy", "--res-energy"],
  ["Science", "--res-science"],
  ["Gold", "--res-gold"],
  ["Exploration", "--res-explore"],
];

/* ---------- input cleaning for tracker ops ---------- */
const TARGETS = TYPE_KEYS.concat(["fin", "gen"]);
const pickKey = (v, keys) => (keys.includes(v) ? v : "");
function numMap(o, keys) {
  const out = {};
  if (o && typeof o === "object") keys.forEach((k) => { const n = int(o[k]); if (n) out[k] = n; });
  return out;
}
export function sanitizeCard(c) {
  c = c && typeof c === "object" ? c : {};
  const scale = c.scale || {};
  const combo = c.combo || {};
  const duo = c.duo || {};
  const name = typeof c.name === "string" ? c.name.trim().slice(0, 40) : "";
  return {
    ...(name ? { name } : {}),
    type: c.type === "empire" || TYPE_KEYS.includes(c.type) ? c.type : "structure",
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
  // A drafted card recycled for its bonus cube. It changes no totals; the log keeps it.
  if (e.kind === "recycle" && RES_KEYS.includes(e.res)) return { ...base, kind: "recycle", res: e.res, card: sanitizeCard(e.card) };
  if (e.kind === "award" && RES_KEYS.includes(e.res) && (e.token === "fin" || e.token === "gen"))
    return { ...base, kind: "award", res: e.res, token: e.token };
  if (e.kind === "adj" && (e.token === "fin" || e.token === "gen")) return { ...base, kind: "adj", token: e.token, n: e.n < 0 ? -1 : 1 };
  return null;
}
const TOKPREF = { material: "fin", energy: "gen", science: "gen", gold: "fin", exploration: "gen" };

export default {
  slug: "iaww",
  name: "It's a Wonderful World",
  short: "IAWW",
  year: 2019,
  players: [1, 5],
  rounds: 4,
  tracker: true,
  options: EXPANSIONS,
  optionsLabel: "Expansions",
  maxPlayers: (game) => (game.exp.ca ? 7 : 5),
  init(game, from) {
    game.tokPref = Object.assign({}, TOKPREF, from && from.tokPref);
  },
  normalize(game) {
    game.tokPref = Object.assign({}, TOKPREF, game.tokPref);
  },

  score: {
    cats: CATS,
    // Ties break on cards built, then character tokens.
    tiebreak(game, p) {
      const s = stats(game, p);
      return [s.built, s.tok.fin + s.tok.gen];
    },
    tiebreakNote: "Ties break on cards built, then character tokens.",
  },

  applyOp(game, op) {
    switch (op.type) {
      case "setTokPref":
        if (!RES_KEYS.includes(op.res) || (op.token !== "fin" && op.token !== "gen")) return false;
        game.tokPref[op.res] = op.token;
        return true;
      case "log": {
        const e = sanitizeEvent(op.event, game);
        if (!e) return false;
        if (!game.log.some((x) => x.id === e.id)) game.log.push(e);
        return true;
      }
      case "setEmpire": {
        const e = sanitizeEvent(op.event, game);
        if (!e || e.kind !== "build") return false;
        e.card.type = "empire";
        e.round = 1;
        game.log = game.log.filter((x) => !(x.kind === "build" && x.player === e.player && x.card.type === "empire"));
        game.log.unshift(e);
        return true;
      }
      case "deleteEvent":
        game.log = game.log.filter((e) => e.id !== op.id);
        return true;
      case "fillScorePad":
        fillScorePad(game);
        return true;
      default:
        return false;
    }
  },

  guide: {
    start: [
      {
        h: "Before the first round",
        items: [
          "Each player takes an Empire card and places it in front of them. Everyone uses the same side unless you agree to play the asymmetric side.",
          "Put the resource cubes, Krystallium, Financiers and Generals where everyone can reach them.",
          "Shuffle the development cards into one deck.",
        ],
      },
      {
        h: "In this app",
        items: [
          "Setup: add each player and turn on the expansions you are using. The game is saved to the server as you go.",
          "Tracker: tap a player, then Empire to enter what their Empire produces and any VP it scores.",
          "During production, the Tracker shows who has supremacy in each resource. Tap Give to award the token.",
          "At the end, open Score, tap Fill from tracker, check each tile, then save the result in Setup.",
        ],
      },
      {
        h: "How you win",
        items: ["The game lasts 4 rounds. The most VP wins.", "Ties break on the most cards built, then the most Financiers and Generals."],
      },
    ],
    order: {
      rounds: 4,
      roundNote: (round) => `passes ${passDir(round)}`,
      steps: (round) => [
        {
          h: "Draft",
          p: [
            `Deal 7 cards to each player. Keep 1 card and pass the rest to the ${passDir(round)}.`,
            `Repeat until everyone has drafted 7 cards. Round ${round} passes ${passDir(round)}; the direction switches each round.`,
          ],
        },
        {
          h: "Plan",
          p: [
            "For each drafted card, choose one: put it in your construction area, or recycle it.",
            "Recycling discards the card for its recycling bonus: 1 cube you place right away, on a card under construction or on your Krystallium area.",
          ],
        },
        ...PRODUCE.map(([name, c]) => ({
          h: `Produce ${name.toLowerCase()}`,
          short: name,
          c,
          p: [
            `Everyone produces ${name.toLowerCase()} at once: your Empire plus every card you have built.`,
            "Place each cube on a card under construction. A card whose cost is complete is built now and produces from the next resource on.",
            "Cubes you cannot or do not want to place go on your Krystallium area. Every 5 there become 1 Krystallium, which stands in for any one resource cube.",
            `Supremacy: the player who produces the most ${name.toLowerCase()}, with no tie, takes the token shown for it. Award it in the Tracker.`,
          ],
        })),
        {
          h: round < 4 ? "End of round" : "End of game",
          p: round < 4
            ? [`Cards left under construction stay there with their cubes. Move the Tracker to round ${round + 1}.`]
            : ["Score each player on the Score page, then save the result in Setup."],
        },
      ],
    },
  },
};
