# Tabletop

Board game guides, score pads and trackers at `tabletop.bridgewater.digital`. Every phone at the table sees the same session, and each one keeps working offline.

Each game in the collection supports one of three tiers:

| Tier | What you get | Games now |
|---|---|---|
| Guide | Getting started, and a step-through of the play order | Codenames |
| Score pad | Guide, plus sessions with standings, a tile per scoring category, an on-screen keypad, live sync and saved results | Wingspan, Ticket to Ride |
| Tracker | Score pad, plus screens written for that game | It's a Wonderful World |

The other 47 games in the collection are listed in the library as "not yet" until someone writes their file.

Every view is designed to fit one phone screen without scrolling, down to a 375 × 667 phone.

## Run it

Node 22.13 or later; there are no dependencies to install.

```bash
npm run dev
```

Opens on `http://localhost:3000` and stores sessions in `./data/tabletop.sqlite` (set `DB_FILE` to change it).

```bash
npm test
```

## Adding a game

1. Write `public/js/games/<slug>.js` exporting a definition. Use the slug already listed for the game in `public/js/games/index.js`.
2. Import it in `public/js/games/index.js` and add it to `DEFS`.
3. Run `npm test`. `test/games.test.js` checks every definition's shape.

A guide-only game needs `slug`, `name`, `year`, `players: [min, max]` and `guide`. `codenames.js` is the smallest example.

```js
guide: {
  start: [{ h: "Set up", items: ["…", "…"] }],         // Getting started sections
  order: {
    rounds: 4,                                         // or null for turn-by-turn games
    roundNote: (round) => `passes left`,               // optional, shown by the round picker
    steps: (round) => [{ h: "Draft", short: "Draft", c: "--res-gold", p: ["…"] }],
  },
}
```

Add `score` for a score pad. `ticket-to-ride.js` and `wingspan.js` show every kind:

```js
score: {
  cats: [
    { k: "birds", label: "Birds", note: "Printed points", kind: "flat" },
    { k: "eggs", label: "Eggs", note: "1 point each", kind: "count", each: 1 },
    { k: "failed", label: "Tickets failed", note: "…", kind: "minus" },
    { k: "adj", label: "Adjustment", note: "…", kind: "signed" },   // + / − switch
    { k: "duo", label: "Duos", note: "…", kind: "mult" },           // count × VP each
    { g: "oceania", k: "nectar", label: "Nectar", note: "…", kind: "flat" }, // only with that option on
  ],
  tiebreakNote: "Ties break on …",
  tiebreak: (game, p) => [/* numbers, higher wins, compared in order */],   // optional
},
options: [{ id: "oceania", name: "Oceania Expansion", note: "Adds nectar scoring" }],
```

A tracker game, like `games/iaww/`, also sets `tracker: true`, adds its own ops with `applyOp(game, op)`, and puts its screens in `games/<slug>/ui.js`, which only the browser loads.

Rules text is written from memory of each rulebook. Check it against your copy and correct the file.

## How sync works

Every change is an op (`addPlayer`, `setCat`, IAWW's `log`, …). Shared ops are in `public/js/core/reducer.js`; a game adds its own in its definition. The browser applies ops to its own copy straight away and queues them in `localStorage`. The server applies the same code to the stored session and pushes the new state to every open device over Server-Sent Events. Ops are idempotent and carry an id, so a retry after a lost response, or two phones changing a session at once, never conflicts or double-counts.

| Path | What |
|---|---|
| `public/js/app.js` | Routes, header, library, game page, score pad, setup, keypad |
| `public/js/core/` | Ops, scoring maths, guide rendering, device store and sync |
| `public/js/games/index.js` | The collection and the list of game definitions |
| `public/js/games/*` | One definition per game; IAWW's tracker in `games/iaww/` |
| `server/` | `node:http` + `node:sqlite`, static files and `/api` |

Routes: `/` library, `/<slug>` game page and sessions, `/<slug>/guide[/order]`, `/<slug>/<id>/tracker|score|setup`.

API: `GET /api/games[?kind=<slug>]`, `POST /api/games {kind, from?}`, `GET/DELETE /api/games/:id`, `POST /api/games/:id/ops`, `POST /api/games/:id/finish`, `GET /api/games/:id/stream`, `GET/DELETE /api/roster`, `GET /api/me`, `GET /healthz`. Saved players are shared across games.

## Deploy

Pushing to `main` runs the checks, publishes `ghcr.io/drakebridgewater/tabletop-helper:latest` and, if the `DOCKHAND_WEBHOOK_URL` secret is set, asks Dockhand to redeploy. `deploy/docker-compose.yml` runs it on Unraid behind Traefik, with the Authelia middleware on the whole host; the variables are in `deploy/.env.example`. Data lives in `${APPDATA}/tabletop.sqlite`; back up that folder.

The server reads the signed-in user from Authelia's `Remote-User` header for the prompt line, which shows `nobody` when the header is missing. Set `TRUST_USER_HEADER=false` if the container is ever reachable without Authelia in front.

## Brand

Built on the Bridgewater system (`../bridgewater-brand`, v2.0.0): the stylesheet, components, self-hosted Fira fonts, favicons and icons are copied into `public/` by `npm run sync-brand`. The signature is `teal`. Where this app bends a rule:

- **Game colors.** IAWW's resource chips and cubes use the game's own card colors (`--res-*` in `app.css`). They carry meaning, are fills only, and always sit next to a word or number.
- **Section links at the bottom.** They are plain teal links as the brand asks, but placed at the bottom of the screen where a thumb reaches them, since the app is used one-handed at the table.
