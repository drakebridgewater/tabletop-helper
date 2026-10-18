// Score pad maths shared by every game with scoring. A game lists its scoring
// categories (def.score.cats); each category is one of these kinds:
//   flat    a number of VP
//   minus   a number of VP taken away (failed tickets, penalties)
//   signed  a number of VP with a + / − switch (bonus or penalty)
//   mult    count × VP each, both entered
//   count   count only; VP each is fixed by the game (cat.each)

export const groupOn = (game, g) => !g || g === "base" || g === "other" || !!(game.exp && game.exp[g]);
export const activeCats = (game, def) => def.score.cats.filter((c) => groupOn(game, c.g));
export const maxPlayers = (game, def) => (def.maxPlayers ? def.maxPlayers(game) : def.players ? def.players[1] : 8);

export function catValue(p, c) {
  const v = p.s[c.k];
  if (v == null) return 0;
  if (c.kind === "mult") return (v.n || 0) * (v.x || 0);
  if (c.kind === "count") return (v.n || 0) * c.each;
  if (c.kind === "signed") return (v.neg ? -1 : 1) * (v.v || 0);
  if (c.kind === "minus") return -(v.v || 0);
  return v.v || 0;
}
export const total = (game, def, p) => activeCats(game, def).reduce((a, c) => a + catValue(p, c), 0);

// Highest total first. A game can add tie-break keys (def.score.tiebreak returns
// numbers, compared in order, higher wins); players equal on every key share a rank.
export function rankPlayers(game, def) {
  const tb = def.score.tiebreak || (() => []);
  const rows = game.players.map((p) => ({ p, t: total(game, def, p), keys: tb(game, p) }));
  const cmp = (a, b) => {
    if (b.t !== a.t) return b.t - a.t;
    for (let i = 0; i < Math.max(a.keys.length, b.keys.length); i++) {
      const d = (b.keys[i] || 0) - (a.keys[i] || 0);
      if (d) return d;
    }
    return 0;
  };
  rows.sort(cmp);
  rows.forEach((r, i) => {
    r.rank = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].rank : i + 1;
    r.tied = rows.some((o) => o !== r && cmp(o, r) === 0);
  });
  return rows;
}

export const playerName = (game, id) => {
  const p = game.players.find((x) => x.id === id);
  return p ? p.name.trim() || "Unnamed" : "Removed player";
};
