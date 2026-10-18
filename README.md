# Wonderful World scores

Production tracker, score pad and play guide for It's a Wonderful World, at `iaww.bridgewater.digital`. Every phone at the table sees the same game, and each one keeps working offline.

- **Tracker**: log built cards and Empire cards per player; production per resource, supremacy awards each round, Financiers and Generals, live VP.
- **Score**: standings and a tile per scoring category, entered with an on-screen keypad. Fill from tracker copies the tracked totals in.
- **Setup**: players, expansions (Corruption & Ascension, War or Peace, Leisure & Decadence, Rise of the Empire), save the result, start the next game with the same players.
- **Games**: past and open games, saved players.
- **Guide**: getting started, and a step-through of the play order for each round.

Every view is designed to fit one phone screen without scrolling, down to a 375 × 667 phone with 5 players.

## Run it

Node 22.13 or later; there are no dependencies to install.

```bash
npm run dev
```

Opens on `http://localhost:3000` and stores games in `./data/iaww.sqlite` (set `DB_FILE` to change it).

```bash
npm test
```

## How sync works

Every change is an op (`addPlayer`, `log`, `setCat`, …) defined in `public/js/reducer.js`. The browser applies ops to its own copy straight away and queues them in `localStorage`; the server applies the same reducer to the stored game and pushes the new state to every open device over Server-Sent Events. Ops are idempotent and carry an id, so a retry after a lost response, or two phones changing the game at once, never conflicts or double-counts.

| Path | What |
|---|---|
| `public/js/rules.js` | Game data and scoring maths, shared with the server |
| `public/js/reducer.js` | Ops and input cleaning, shared with the server |
| `public/js/store.js` | Device copy, op queue, live updates |
| `public/js/app.js` | Views and actions |
| `public/js/guide.js` | Guide text as data; check it against your rulebook |
| `server/` | `node:http` + `node:sqlite`, static files and `/api` |

API: `GET/POST /api/games`, `GET/DELETE /api/games/:id`, `POST /api/games/:id/ops`, `POST /api/games/:id/finish`, `GET /api/games/:id/stream`, `GET/DELETE /api/roster`, `GET /api/me`, `GET /healthz`.

## Deploy

Pushing to `main` runs the checks, publishes `ghcr.io/drakebridgewater/wonderful-world-scores:latest` and, if the `DOCKHAND_WEBHOOK_URL` secret is set, asks Dockhand to redeploy. `deploy/docker-compose.yml` runs it on Unraid behind Traefik with the Authelia middleware on the whole host; the variables are in `deploy/.env.example`. Data lives in `${APPDATA}/iaww.sqlite`; back up that folder.

The server reads the signed-in user from Authelia's `Remote-User` header for the prompt line. Set `TRUST_USER_HEADER=false` if the container is ever reachable without Authelia in front.

## Brand

Built on the Bridgewater system (`../bridgewater-brand`): the stylesheet, components, favicons and icons are copied into `public/` by `npm run sync-brand`. The signature is `teal`. Where this app bends a rule:

- **Game colors.** Material, energy, science, gold and exploration chips and cubes use the game's own card colors (`--res-*` in `app.css`). They carry meaning, are fills only, and always sit next to a word or number.
- **Section links at the bottom.** They are plain teal links as the brand asks, but placed at the bottom of the screen where a thumb reaches them, since the app is used one-handed at the table.
- **Fonts** still load from Google Fonts. Self-host the Fira woff2 files before relying on it offline.
