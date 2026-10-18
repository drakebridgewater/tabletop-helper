// One session on this device: the last state the server confirmed, plus the ops
// made here that the server has not confirmed yet. What you see is the two
// combined, so the app keeps working offline and catches up when it can.

import { applyOp, normalizeGame } from "./reducer.js";

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const local = {
  get(k) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage unavailable: the game still syncs to the server */
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export class GameStore {
  constructor(id, def, onChange, onStatus) {
    this.id = id;
    this.def = def;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.base = local.get(`tabletop:game:${id}`);
    this.pending = local.get(`tabletop:pending:${id}`) || [];
    this.busy = false;
    this.status = "saving";
    this.recompute();
  }

  recompute() {
    if (!this.base) return (this.state = null);
    const s = normalizeGame(structuredClone(this.base.state), this.def);
    for (const op of this.pending) applyOp(s, op, this.def);
    this.state = s;
  }

  setStatus(s) {
    if (s === this.status) return;
    this.status = s;
    this.onStatus(s);
  }

  async load() {
    try {
      this.adopt(await api(`/api/games/${this.id}`));
    } catch (e) {
      if (e.status === 404 || !this.base) throw e;
      this.setStatus("offline");
    }
    this.connect();
    this.flush();
  }

  adopt(g) {
    if (this.base && g.version < this.base.version) return;
    this.base = g;
    local.set(`tabletop:game:${this.id}`, g);
    // Ops the server already applied drop out of the queue.
    const seen = new Set(g.state._ops || []);
    const before = this.pending.length;
    this.pending = this.pending.filter((op) => !seen.has(op.opId));
    if (this.pending.length !== before) local.set(`tabletop:pending:${this.id}`, this.pending);
    this.recompute();
    this.onChange();
  }

  connect() {
    if (this.es || typeof EventSource === "undefined") return;
    this.es = new EventSource(`/api/games/${this.id}/stream`);
    this.es.addEventListener("state", (e) => this.adopt(JSON.parse(e.data)));
    this.es.addEventListener("open", () => this.flush());
    this.es.addEventListener("error", () => {
      if (this.es.readyState !== EventSource.OPEN) this.setStatus(this.pending.length ? "offline" : "reconnecting");
    });
  }

  dispatch(op) {
    op.opId = uid();
    this.pending.push(op);
    local.set(`tabletop:pending:${this.id}`, this.pending);
    this.recompute();
    this.onChange();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  async flush() {
    if (this.busy) return;
    if (!this.pending.length) {
      if (!this.es || this.es.readyState === EventSource.OPEN) this.setStatus("synced");
      return;
    }
    this.busy = true;
    this.setStatus("saving");
    const ops = this.pending.slice(0, 200);
    try {
      this.adopt(await api(`/api/games/${this.id}/ops`, { method: "POST", body: { ops } }));
      this.busy = false;
      this.flush();
    } catch (e) {
      this.busy = false;
      this.setStatus(e.status ? "failed" : "offline");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 5000);
    }
  }

  async finish() {
    await this.flushNow();
    this.adopt(await api(`/api/games/${this.id}/finish`, { method: "POST" }));
  }

  async flushNow() {
    clearTimeout(this.timer);
    await this.flush();
    if (this.pending.length) throw new Error("Not saved yet");
  }

  close() {
    clearTimeout(this.timer);
    if (this.es) this.es.close();
  }
}
