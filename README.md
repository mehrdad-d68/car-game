# Car Game

A browser driving game built on real OpenStreetMap data for Vienna — 2,913
streets, 20,065 buildings, and 1,110 pieces of street furniture (traffic lights,
bus stops, crossings, stations), rendered in three.js.

**[Live demo](https://car-game-dld.pages.dev)** — password protected.

---

## Running it locally

You need **Node 24** (the CI builds on 24; anything newer should be fine) and
npm. Nothing else — no database, no API keys, no accounts.

The project is two apps that run side by side. **Both have to be running**: the
backend serves the map and the catalogs, the frontend is the game.

### 1. Start the backend

```bash
cd backend
npm ci
npm run start:dev
```

It listens on **http://localhost:3000**. Leave it running.

### 2. Start the frontend, in a second terminal

```bash
cd frontend
npm ci
npm start
```

Open **http://localhost:4200**. The first load pulls about 10 MB of map data, so
give it a few seconds.

The frontend's dev server forwards anything under `/api` to port 3000, so you do
not need to configure a URL anywhere. If the city loads but the roads are empty,
the backend is not running.

## Controls

| | |
|---|---|
| Drive | `W` `A` `S` `D` or the arrow keys |
| Brake | `Space` |
| Map inspector | `` ` `` (backquote) — development builds only |

The inspector pauses the game and lets you click anywhere on the map to get its
coordinates, the street you clicked, and which building it belongs to.

## Tests

```bash
cd backend  && npm test                    # 75 tests
cd frontend && npx ng test --watch=false   # 541 tests
```

On the frontend, plain `npm test` starts a watcher that stays open and re-runs
on every file change. `--watch=false` is the one-shot version.

Both suites run on every push in CI, and a failure blocks the deploy.

## How it fits together

```
backend/     NestJS. Serves the map and the catalogs of cars, buildings and
             street props as JSON. Read-only — no database, no writes.

frontend/    Angular + three.js. All the game logic lives here.
  engine/sim/      simulation — physics, routing, map geometry. No three.js.
  engine/render/   rendering — meshes, textures, instancing. No game state.
  adapters/        talks to the backend and the keyboard.
```

The split between `sim/` and `render/` is deliberate and enforced: the
simulation runs on a fixed timestep and imports nothing from three.js, so it can
be tested without a browser or a GPU. `ARCHITECTURE.md` has the reasoning.

Cars, buildings and street props are **data, not code** — they are described in
the backend and drawn generically, so a new building design is a JSON-shaped
edit rather than a rendering change.

## Deployment

Pushing to `master` runs both test suites, then deploys to Cloudflare Pages.

There is no server in production. The backend's responses are written out as
static files at build time, so the same `/api/...` paths the game already
fetches are served straight from the CDN. A Cloudflare Pages Function adds HTTP
Basic auth in front of everything.

The deploy workflow generates these files itself (`npm run export:static`, which
writes to `frontend/public/api/`) on every run, so there is nothing to rebuild by
hand.

**Don't run the export locally.** The frontend dev server serves anything in
`frontend/public/` before it forwards requests to the backend, so a local export
hides your running backend: the game keeps reading the snapshot, and backend
changes seem to have no effect. If you did run it, delete `frontend/public/api/`.

## Map data

The map is a pre-processed OpenStreetMap extract committed at
`backend/src/modules/map/data/vienna-roads.json` (~19 MB). It is generated
separately and is not downloaded at build time, so the repo is self-contained.
