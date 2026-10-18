import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { applyOp, freshGame, normalizeGame } from "../public/js/core/reducer.js";
import { rankPlayers } from "../public/js/core/score.js";
import { getDef } from "../public/js/games/index.js";

export function openDb(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      finished_at INTEGER,
      result TEXT
    );
    CREATE TABLE IF NOT EXISTS roster (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      added_at INTEGER NOT NULL
    );
  `);
  // Sessions made before there was more than one game are It's a Wonderful World.
  if (!db.prepare("PRAGMA table_info(games)").all().some((c) => c.name === "kind")) {
    db.exec("ALTER TABLE games ADD COLUMN kind TEXT NOT NULL DEFAULT 'iaww'");
  }
  db.exec("CREATE INDEX IF NOT EXISTS games_kind ON games (kind, updated_at)");

  const q = {
    get: db.prepare("SELECT * FROM games WHERE id = ?"),
    list: db.prepare("SELECT id, kind, state, created_at, updated_at, finished_at, result FROM games ORDER BY updated_at DESC LIMIT ?"),
    listKind: db.prepare("SELECT id, kind, state, created_at, updated_at, finished_at, result FROM games WHERE kind = ? ORDER BY updated_at DESC LIMIT ?"),
    insert: db.prepare("INSERT INTO games (kind, state, created_at, updated_at) VALUES (?, ?, ?, ?)"),
    save: db.prepare("UPDATE games SET state = ?, version = version + 1, updated_at = ? WHERE id = ?"),
    finish: db.prepare("UPDATE games SET finished_at = ?, result = ?, updated_at = ? WHERE id = ?"),
    del: db.prepare("DELETE FROM games WHERE id = ?"),
    roster: db.prepare("SELECT name FROM roster ORDER BY name COLLATE NOCASE"),
    rosterAdd: db.prepare("INSERT OR IGNORE INTO roster (name, added_at) VALUES (?, ?)"),
    rosterDel: db.prepare("DELETE FROM roster WHERE name = ?"),
  };

  // A session whose game has no scoring definition any more is left out.
  const row = (r) => {
    const def = r && getDef(r.kind);
    if (!def || !def.score) return null;
    return {
      id: r.id,
      kind: r.kind,
      def,
      version: r.version,
      state: normalizeGame(JSON.parse(r.state), def),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      finishedAt: r.finished_at,
      result: r.result ? JSON.parse(r.result) : null,
    };
  };
  const summary = (r) => {
    const s = JSON.parse(r.state);
    return {
      id: r.id,
      kind: r.kind,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      finishedAt: r.finished_at,
      players: (s.players || []).map((p) => p.name),
      result: r.result ? JSON.parse(r.result) : null,
    };
  };

  return {
    close: () => db.close(),
    getGame: (id) => row(q.get.get(id)),

    listGames: (kind, limit = 50) => (kind ? q.listKind.all(kind, limit) : q.list.all(limit)).map(summary),

    /** Starts a session of `kind`, carrying players and options over from `fromId` when it is the same game. */
    createGame(kind, fromId) {
      const def = getDef(kind);
      if (!def || !def.score) return null;
      const from = fromId ? row(q.get.get(fromId)) : null;
      const state = normalizeGame(freshGame(def, from && from.kind === kind ? from.state : null), def);
      const now = Date.now();
      const { lastInsertRowid } = q.insert.run(kind, JSON.stringify(state), now, now);
      return row(q.get.get(Number(lastInsertRowid)));
    },

    applyOps(id, ops) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const g = row(q.get.get(id));
        if (!g) {
          db.exec("ROLLBACK");
          return null;
        }
        for (const op of ops) applyOp(g.state, op, g.def);
        q.save.run(JSON.stringify(g.state), Date.now(), id);
        db.exec("COMMIT");
        return row(q.get.get(id));
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },

    // Saves the ranked result and remembers each named player for next time, in any game.
    finishGame(id) {
      const g = row(q.get.get(id));
      if (!g) return null;
      const result = rankPlayers(g.state, g.def).map((r) => ({ n: r.p.name.trim() || "Unnamed", t: r.t, rank: r.rank }));
      const now = Date.now();
      q.finish.run(now, JSON.stringify(result), now, id);
      for (const p of g.state.players) {
        const n = p.name.trim();
        if (n && !/^Player \d+$/.test(n)) q.rosterAdd.run(n, now);
      }
      return row(q.get.get(id));
    },

    deleteGame: (id) => q.del.run(id).changes > 0,
    roster: () => q.roster.all().map((r) => r.name),
    removeFromRoster: (name) => q.rosterDel.run(name).changes > 0,
  };
}
