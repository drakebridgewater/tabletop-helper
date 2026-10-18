// It's a Wonderful World: game data and the tracker maths. Pure functions,
// shared by the browser and the server.

export const EXPANSIONS = [
  { id: "ca", name: "Corruption & Ascension", note: "Duo scoring, corruption, up to 7 players" },
  { id: "wop", name: "War or Peace", note: "Campaign scenario VP" },
  { id: "ld", name: "Leisure & Decadence", note: "Campaign scenario and track VP" },
  { id: "rote", name: "Rise of the Empire", note: "Expansion VP" },
];

export const RES = [
  { k: "material", label: "Material", s: "Mat", c: "--res-material" },
  { k: "energy", label: "Energy", s: "Ene", c: "--res-energy" },
  { k: "science", label: "Science", s: "Sci", c: "--res-science" },
  { k: "gold", label: "Gold", s: "Gold", c: "--res-gold" },
  { k: "exploration", label: "Exploration", s: "Exp", c: "--res-explore" },
];
export const RES_KEYS = RES.map((r) => r.k);

export const TYPES = [
  { k: "structure", label: "Structure", c: "--res-material" },
  { k: "vehicle", label: "Vehicle", c: "--res-energy" },
  { k: "research", label: "Research", c: "--res-science" },
  { k: "project", label: "Project", c: "--res-gold" },
  { k: "discovery", label: "Discovery", c: "--res-explore" },
];
export const TYPE_KEYS = TYPES.map((t) => t.k);

export const TOK = {
  fin: { label: "Financier", c: "--res-fin" },
  gen: { label: "General", c: "--res-gen" },
};

// Everything a card can cost, produce or grant, with its chip color.
export const KEYS = {
  kry: { label: "Krystallium", s: "Kryst.", c: "--res-kry" },
  fin: { label: "Financier", s: "Financier", c: "--res-fin", round: true },
  gen: { label: "General", s: "General", c: "--res-gen", round: true },
};
RES.forEach((r) => (KEYS[r.k] = { label: r.label, s: r.label, c: r.c }));

export const CATS = [
  { g: "base", k: "cards", label: "Card VP", note: "Printed VP on built cards", kind: "flat" },
  { g: "base", k: "structure", label: "Structures", note: "Grey cards", kind: "mult", c: "--res-material" },
  { g: "base", k: "vehicle", label: "Vehicles", note: "Black cards", kind: "mult", c: "--res-energy" },
  { g: "base", k: "research", label: "Research", note: "Green cards", kind: "mult", c: "--res-science" },
  { g: "base", k: "project", label: "Projects", note: "Yellow cards", kind: "mult", c: "--res-gold" },
  { g: "base", k: "discovery", label: "Discoveries", note: "Blue cards", kind: "mult", c: "--res-explore" },
  { g: "base", k: "financier", label: "Financiers", note: "Tokens × (1 + card bonuses)", kind: "mult", c: "--res-fin", round: true },
  { g: "base", k: "general", label: "Generals", note: "Tokens × (1 + card bonuses)", kind: "mult", c: "--res-gen", round: true },
  { g: "ca", k: "duo1", label: "Duo A", note: "Pairs × VP per pair", kind: "mult" },
  { g: "ca", k: "duo2", label: "Duo B", note: "Second duo card, if any", kind: "mult" },
  { g: "wop", k: "wop", label: "War or Peace", note: "Scenario bonus or penalty", kind: "signed" },
  { g: "ld", k: "ldtrack", label: "L&D track", note: "Points from the new track", kind: "flat" },
  { g: "ld", k: "ld", label: "L&D scenario", note: "Scenario bonus or penalty", kind: "signed" },
  { g: "rote", k: "rote", label: "Empire VP", note: "Rise of the Empire bonus or penalty", kind: "signed" },
  { g: "other", k: "adj", label: "Adjustment", note: "Anything else", kind: "signed" },
];
export const CAT_KEYS = CATS.map((c) => c.k);

export const resLabel = (k) => (RES.find((r) => r.k === k) || {}).label || k;
export const typeLabel = (k) => (k === "empire" ? "Empire card" : (TYPES.find((t) => t.k === k) || {}).label || k);
export const targetLabel = (k) => (TOK[k] ? TOK[k].label : typeLabel(k));

/* ---------- tracker maths (derived from the event log) ---------- */
export function stats(game, p) {
  const ev = game.log.filter((e) => e.player === p.id);
  const cards = ev.filter((e) => e.kind === "build").map((e) => e.card);
  const counts = {};
  TYPES.forEach((t) => (counts[t.k] = 0));
  let built = 0;
  cards.forEach((c) => {
    if (c.type !== "empire" && counts[c.type] != null) {
      counts[c.type]++;
      built++;
    }
  });
  const prod = {};
  RES.forEach((r) => (prod[r.k] = 0));
  cards.forEach((c) => {
    RES.forEach((r) => (prod[r.k] += ((c.prod || {})[r.k] || 0) - ((c.corr || {})[r.k] || 0)));
    if (c.scale && c.scale.res && c.scale.per && c.scale.n) prod[c.scale.res] += c.scale.n * (counts[c.scale.per] || 0);
  });
  RES.forEach((r) => (prod[r.k] = Math.max(0, prod[r.k])));
  const tok = { fin: 0, gen: 0 };
  ev.forEach((e) => {
    if (e.kind === "award") tok[e.token] += 1;
    if (e.kind === "adj") tok[e.token] += e.n;
    if (e.kind === "build") {
      const c = e.card;
      ["fin", "gen"].forEach((k) => (tok[k] += ((c.bonus || {})[k] || 0) - ((c.cost || {})[k] || 0)));
    }
  });
  tok.fin = Math.max(0, tok.fin);
  tok.gen = Math.max(0, tok.gen);
  const mult = { fin: 0, gen: 0 };
  TYPES.forEach((t) => (mult[t.k] = 0));
  let gross = 0;
  const duos = [];
  cards.forEach((c) => {
    gross += c.vp || 0;
    if (c.combo && c.combo.t && c.combo.x) mult[c.combo.t] += c.combo.x;
    if (c.duo && c.duo.a && c.duo.b && c.duo.x) duos.push({ a: c.duo.a, b: c.duo.b, x: c.duo.x });
  });
  const cnt = (k) => (k === "fin" ? tok.fin : k === "gen" ? tok.gen : counts[k] || 0);
  duos.forEach((d) => (d.n = d.a === d.b ? Math.floor(cnt(d.a) / 2) : Math.min(cnt(d.a), cnt(d.b))));
  let vp = gross + TYPES.reduce((a, t) => a + mult[t.k] * counts[t.k], 0) + tok.fin * (1 + mult.fin) + tok.gen * (1 + mult.gen);
  if (game.exp.ca) vp += duos.reduce((a, d) => a + d.n * d.x, 0);
  return { cards, counts, built, prod, tok, mult, gross, duos, vp, hasData: ev.length > 0 };
}

export function leaderOf(statsList, res) {
  let best = 0;
  let who = [];
  statsList.forEach(({ p, s }) => {
    const v = s.prod[res];
    if (v > best) {
      best = v;
      who = [p];
    } else if (v === best && v > 0) who.push(p);
  });
  return { best, who };
}

// Copies the tracker's derived totals into each tracked player's score pad rows.
export function fillScorePad(game) {
  game.players.forEach((p) => {
    const s = stats(game, p);
    if (!s.hasData) return;
    p.s.cards = { v: s.gross };
    TYPES.forEach((t) => (p.s[t.k] = { n: s.counts[t.k], x: s.mult[t.k] }));
    p.s.financier = { n: s.tok.fin, x: 1 + s.mult.fin };
    p.s.general = { n: s.tok.gen, x: 1 + s.mult.gen };
    const groups = {};
    s.duos.forEach((d) => {
      const k = d.a + "+" + d.b;
      (groups[k] = groups[k] || []).push(d);
    });
    const g = Object.values(groups);
    p.s.duo1 = g[0] ? { n: g[0][0].n, x: g[0].reduce((a, d) => a + d.x, 0) } : {};
    const rest = g.slice(1).flat();
    p.s.duo2 = rest.length ? { n: 1, x: rest.reduce((a, d) => a + d.n * d.x, 0) } : {};
  });
}

export function cardSummary(c) {
  const bits = [];
  const cl = { kry: "Kry", fin: "Fin", gen: "Gen" };
  const cost = RES_KEYS.concat(["kry", "fin", "gen"])
    .filter((k) => (c.cost || {})[k])
    .map((k) => `${c.cost[k]} ${cl[k] || (RES.find((r) => r.k === k) || {}).s}`);
  if (cost.length) bits.push("cost " + cost.join(", "));
  const prod = RES.filter((r) => (c.prod || {})[r.k]).map((r) => `${c.prod[r.k]} ${r.s}`);
  if (prod.length) bits.push("+" + prod.join(", "));
  const corr = RES.filter((r) => (c.corr || {})[r.k]).map((r) => `−${c.corr[r.k]} ${r.s}`);
  if (corr.length) bits.push(corr.join(", "));
  if (c.scale && c.scale.n && c.scale.res && c.scale.per) bits.push(`${c.scale.n} ${resLabel(c.scale.res)}/${typeLabel(c.scale.per)}`);
  if (c.vp) bits.push(`${c.vp} VP`);
  if (c.combo && c.combo.t && c.combo.x) bits.push(`${c.combo.x} VP/${targetLabel(c.combo.t)}`);
  if (c.duo && c.duo.a && c.duo.b && c.duo.x) bits.push(`${c.duo.x} VP/duo ${targetLabel(c.duo.a)}+${targetLabel(c.duo.b)}`);
  const b = c.bonus || {};
  const bb = [b.fin && `${b.fin} Fin`, b.gen && `${b.gen} Gen`, b.kry && `${b.kry} Kryst`].filter(Boolean);
  if (bb.length) bits.push("bonus " + bb.join(", "));
  return bits.join(" · ") || "No production or VP";
}
