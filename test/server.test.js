import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/index.js";

let server;
let base;
before(async () => {
  ({ server } = createApp({ dbFile: ":memory:" }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const call = async (path, { method = "GET", body, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text && res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text, res };
};

test("a game goes from created to saved, and named players join the roster", async () => {
  const created = await call("/api/games", { method: "POST", body: {} });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const ops = [
    { opId: "o1", type: "renamePlayer", id: "p1", name: "Ana" },
    { opId: "o2", type: "setCat", player: "p1", key: "cards", value: { v: 12 } },
  ];
  const r1 = await call(`/api/games/${id}/ops`, { method: "POST", body: { ops } });
  assert.equal(r1.status, 200);
  // Sending the same ops again (a retry after a lost response) changes nothing.
  const r2 = await call(`/api/games/${id}/ops`, { method: "POST", body: { ops } });
  assert.deepEqual(r2.body.state.players, r1.body.state.players);

  const fin = await call(`/api/games/${id}/finish`, { method: "POST" });
  assert.equal(fin.body.result[0].n, "Ana");
  assert.equal(fin.body.result[0].t, 12);
  assert.deepEqual((await call("/api/roster")).body, ["Ana"]);

  const next = await call("/api/games", { method: "POST", body: { from: id } });
  assert.equal(next.body.state.players[0].name, "Ana");
  assert.deepEqual(next.body.state.players[0].s, {});

  const list = await call("/api/games");
  assert.equal(list.body.length, 2);
});

test("the live stream sends the current state, then each change", async () => {
  const { body: g } = await call("/api/games", { method: "POST", body: {} });
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/games/${g.id}/stream`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const nextEvent = async () => {
    while (!buf.includes("\n\n")) buf += dec.decode((await reader.read()).value);
    const i = buf.indexOf("\n\n");
    const chunk = buf.slice(0, i);
    buf = buf.slice(i + 2);
    return JSON.parse(chunk.split("\n").find((l) => l.startsWith("data: ")).slice(6));
  };
  assert.equal((await nextEvent()).version, 1);
  await call(`/api/games/${g.id}/ops`, { method: "POST", body: { ops: [{ opId: "s1", type: "setRound", round: 2 }] } });
  const ev = await nextEvent();
  assert.equal(ev.version, 2);
  assert.equal(ev.state.round, 2);
  ctrl.abort();
});

test("errors and the app shell", async () => {
  assert.equal((await call("/api/games/999")).status, 404);
  assert.equal((await call("/api/games/abc")).status, 404);
  assert.equal((await call("/api/games/1/ops", { method: "POST", body: { ops: "x" } })).status, 400);
  const shell = await call("/games/5/score");
  assert.equal(shell.status, 200);
  assert.match(shell.res.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal((await call("/missing.js")).status, 404);
  assert.equal((await call("/../server/index.js")).status, 404);
  assert.equal((await call("/api/me", { headers: { "remote-user": "drake" } })).body.user, "drake");
});
