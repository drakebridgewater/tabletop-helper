import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openDb } from "./db.js";

const ROOT = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const MAX_BODY = 256 * 1024;
const MAX_OPS = 200;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers = {}) {
  const json = typeof body !== "string";
  res.writeHead(status, {
    "content-type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new HttpError(413, "Request too large");
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body is not JSON");
  }
}

const publicGame = (g) => ({ id: g.id, version: g.version, state: g.state, finishedAt: g.finishedAt, result: g.result });

export function createApp({ dbFile = ":memory:", trustUserHeader = true, version = "dev" } = {}) {
  const db = openDb(dbFile);
  const streams = new Map(); // game id -> Set of SSE responses

  function broadcast(g) {
    const set = streams.get(g.id);
    if (!set) return;
    const msg = `event: state\ndata: ${JSON.stringify(publicGame(g))}\n\n`;
    for (const res of set) res.write(msg);
  }
  const heartbeat = setInterval(() => {
    for (const set of streams.values()) for (const res of set) res.write(": ping\n\n");
  }, 25000);
  heartbeat.unref();

  async function api(req, res, url) {
    const parts = url.pathname.split("/").filter(Boolean).slice(1); // drop "api"
    const m = req.method;
    const gameId = parts[0] === "games" && parts[1] ? Number(parts[1]) : null;
    if (gameId !== null && !Number.isInteger(gameId)) throw new HttpError(404, "No such game");

    if (parts[0] === "me" && m === "GET") {
      const user = trustUserHeader ? String(req.headers["remote-user"] || "").slice(0, 64) || null : null;
      return send(res, 200, { user, version });
    }
    if (parts[0] === "games" && parts.length === 1) {
      if (m === "GET") return send(res, 200, db.listGames());
      if (m === "POST") {
        const body = await readJson(req);
        const from = Number.isInteger(body.from) ? body.from : null;
        return send(res, 201, publicGame(db.createGame(from)));
      }
    }
    if (gameId !== null && parts.length === 2) {
      if (m === "GET") {
        const g = db.getGame(gameId);
        return g ? send(res, 200, publicGame(g)) : send(res, 404, { error: "No such game" });
      }
      if (m === "DELETE") return db.deleteGame(gameId) ? send(res, 204, "") : send(res, 404, { error: "No such game" });
    }
    if (gameId !== null && parts[2] === "ops" && m === "POST") {
      const body = await readJson(req);
      if (!Array.isArray(body.ops) || body.ops.length > MAX_OPS) throw new HttpError(400, `Send up to ${MAX_OPS} ops`);
      const g = db.applyOps(gameId, body.ops);
      if (!g) return send(res, 404, { error: "No such game" });
      broadcast(g);
      return send(res, 200, publicGame(g));
    }
    if (gameId !== null && parts[2] === "finish" && m === "POST") {
      const g = db.finishGame(gameId);
      if (!g) return send(res, 404, { error: "No such game" });
      broadcast(g);
      return send(res, 200, publicGame(g));
    }
    if (gameId !== null && parts[2] === "stream" && m === "GET") {
      const g = db.getGame(gameId);
      if (!g) return send(res, 404, { error: "No such game" });
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write(`retry: 3000\nevent: state\ndata: ${JSON.stringify(publicGame(g))}\n\n`);
      if (!streams.has(gameId)) streams.set(gameId, new Set());
      streams.get(gameId).add(res);
      req.on("close", () => {
        const set = streams.get(gameId);
        set.delete(res);
        if (!set.size) streams.delete(gameId);
      });
      return;
    }
    if (parts[0] === "roster") {
      if (m === "GET" && parts.length === 1) return send(res, 200, db.roster());
      if (m === "DELETE" && parts[1]) {
        db.removeFromRoster(decodeURIComponent(parts[1]));
        return send(res, 204, "");
      }
    }
    throw new HttpError(404, "Not found");
  }

  async function serveStatic(req, res, url) {
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    let file = join(ROOT, rel);
    if (!file.startsWith(ROOT)) return send(res, 403, "Forbidden");
    let info = await stat(file).catch(() => null);
    // Client routes (/games/12/tracker) all load the app shell.
    if (!info || info.isDirectory()) {
      if (extname(rel)) return send(res, 404, "Not found");
      file = join(ROOT, "index.html");
      info = await stat(file);
    }
    const ext = extname(file);
    // File names carry no build hash, so browsers revalidate every time and get
    // a 304 when nothing changed. A deploy is then picked up on the next load.
    const etag = `"${info.size.toString(36)}-${Math.trunc(info.mtimeMs).toString(36)}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { etag, "cache-control": "no-cache" });
      return res.end();
    }
    res.writeHead(200, {
      "content-type": TYPES[ext] || "application/octet-stream",
      "content-length": info.size,
      etag,
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      ...(ext === ".html" ? { "content-security-policy": CSP } : {}),
    });
    if (req.method === "HEAD") return res.end();
    res.end(await readFile(file));
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    try {
      if (url.pathname === "/healthz") return send(res, 200, "ok");
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
      return await serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: "Server error" });
      else res.end();
    }
  });
  server.on("close", () => {
    clearInterval(heartbeat);
    db.close();
  });
  return { server, db };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  const { server } = createApp({
    dbFile: process.env.DB_FILE || "./data/iaww.sqlite",
    trustUserHeader: process.env.TRUST_USER_HEADER !== "false",
    version: process.env.APP_VERSION || "dev",
  });
  server.listen(port, process.env.HOST || "0.0.0.0", () => console.log(`iaww listening on :${port}`));
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections(); // open live-update streams would otherwise hold the close
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
