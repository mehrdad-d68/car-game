# AGENTS.md — Car Game Development Guide

Read this file **before creating any new files** in this repository.

## Overview

Monorepo with two apps:

- `backend/` — NestJS API (single-player; serves data: scores, saves, profiles)
- `frontend/` — Angular + three.js game (single-player, 3D)

No multiplayer / networking is planned. The backend is intentionally thin.

---

## Architecture principles (follow these)

1. **Fold by feature (domain), not by type.**
   Never create global `controllers/`, `services/`, `models/`, `components/`
   grab-bags at the app root. Each feature owns all of its related files.

2. **Frontend — `core/` vs `shared/` vs `features/`:**
   - `core/` — app-wide singletons (services, interceptors, guards). Instantiated once.
   - `shared/` — dumb, reusable pieces with **no business logic** (UI, plain models).
   - `features/` — one folder per screen/domain. A feature is self-contained.

3. **Mirror domain names between backend and frontend.**
   If the backend has a `modules/cars/` feature, the frontend should have a
   `features/cars/` feature, so the two stay easy to map across the stack.

4. **Keep the game engine framework-agnostic.**
   Everything under `frontend/src/app/features/game/engine/` must have **zero
   Angular imports** (no `@angular/*`). Keep it testable and portable.

5. **Separate simulation from rendering.** Inside `engine/`:
   - `sim/` — the rules of the game. Pure TypeScript: **no `three`**, no
     Angular, no DOM. This is where behaviour lives and where tests go.
   - `render/` — three.js only. Reads sim state and draws it; never owns it.

   State flows one way, `sim/` → `render/`. If you need a value in order to
   draw, it belongs in `sim/`.

6. **The engine declares its inputs as ports.** `engine/ports.ts` defines the
   interfaces the engine needs (`InputSource`). Angular-side code implements
   them under `features/<feature>/adapters/`. Dependencies point inward —
   the engine never reaches out to Angular.

7. **Single-player ⇒ thin backend.** The API mostly stores/returns data.
   Don't over-engineer networking, rooms, or real-time sync.

---

## Directory layout

### Backend (`backend/src/`)

```
backend/src/
├── main.ts
├── app.module.ts          # thin root; imports feature modules only
└── modules/               # one feature = one folder
    └── app/               # bootstrap feature
        ├── app.module.ts
        ├── app.controller.ts
        ├── app.controller.spec.ts
        └── app.service.ts
```

A feature module (e.g. `cars/`) should contain, when applicable:

```
modules/cars/
├── cars.module.ts
├── cars.controller.ts
├── cars.service.ts
├── dto/                   # input/output shapes
└── entities/              # DB entities (when a DB is added)
```

When you add a feature module, register it in the appropriate place and keep
the root `app.module.ts` as a thin aggregator.

### Frontend (`frontend/src/app/`)

```
frontend/src/app/
├── app.ts / app.html / app.css   # root shell (router-outlet only, no logic)
├── app.config.ts
├── app.routes.ts
├── app.spec.ts
├── core/                         # app-wide singletons
│   └── services/
│       └── input.service.ts      # keyboard input state
├── shared/                       # (create when needed) dumb, reusable pieces
├── features/                     # one folder per feature
│   └── game/                     # the game feature
│       ├── game.component.ts / .html / .css
│       ├── adapters/             # Angular-side implementations of engine ports
│       │   └── keyboard-input.ts # implements InputSource
│       └── engine/               # NO Angular imports anywhere below here
│           ├── index.ts          # public surface: Engine + port types
│           ├── engine.ts         # composition root: wires sim + render + loop
│           ├── loop.ts           # fixed-timestep accumulator
│           ├── ports.ts          # InputSource, InputFrame
│           ├── sim/              # pure TypeScript — NO three.js
│           │   ├── types.ts      # Vec2, CarState
│           │   ├── vehicle.ts    # throttle/steer/brake → position/heading
│           │   └── track.ts      # track geometry as data
│           └── render/           # three.js only — reads sim state
│               ├── scene.ts      # lights, fog, background
│               ├── viewport.ts   # WebGLRenderer + container resize
│               ├── camera-rig.ts # follow camera
│               ├── car-view.ts   # car mesh, interpolated from CarState
│               └── track-view.ts # ground, roads, lane dashes from TrackData
└── environments/                 # environment.ts / environment.prod.ts
```

**The game loop runs on a fixed timestep.** `sim/` is stepped at a constant
`dt` and `render/` interpolates between the last two states. Never integrate
against a raw frame delta — it makes handling frame-rate dependent and breaks
determinism. `loop.ts` owns this; don't bypass it.

---

## New-file rules (what to do before creating a file)

1. Decide **which feature/domain** the file belongs to.
2. Place it in that feature's folder — never at the app root unless it's the
   root shell itself.
3. Is it app-wide (used by many features)? → `core/`
4. Is it generic, reusable, with no business logic? → `shared/`
5. Is it game rules/state (how the car behaves, what the track is)? →
   `features/<feature>/engine/sim/` and **import neither Angular nor three.js**.
6. Is it three.js drawing code? → `features/<feature>/engine/render/` and
   **use no Angular imports**.
7. Does the engine need something from the browser or Angular (input, assets,
   audio)? → declare an interface in `engine/ports.ts`, implement it in
   `features/<feature>/adapters/`. Never import Angular into the engine.
8. Backend endpoint/data for this feature? → a matching `modules/<feature>/` folder.
9. If a folder for the feature doesn't exist yet, create it and mirror the
   domain name on the other side of the stack if needed.

## Conventions

- **Never commit or push — no exceptions.** See the dedicated section below.
- **No code comments** unless explicitly requested.
- Follow the existing file style in the neighboring files.
- Match the package manager / scripts already in place
  (`backend/package.json`, `frontend/package.json`).
- **Write tests for `engine/sim/` and for anything with branching logic.**
  `sim/` runs in plain Node with no browser — there is no excuse for untested
  game rules. `render/scene.ts` and `render/viewport.ts` are exempt (pure
  config and WebGL respectively); the rest of `render/` is testable in jsdom
  because three.js object math needs no GL context.
- Run the relevant build/test before considering work done:
  - Backend: `cd backend && npm run build`
  - Frontend: `cd frontend && npm run build` and `npx ng test --watch=false`

## Never commit or push — no exceptions

**Never run any command that commits, pushes, or otherwise rewrites history
unless the user asks for it in that specific message.** The user owns version
control entirely.

This includes, and is not limited to:

```
git commit          git commit --amend      git push
git merge           git rebase              git cherry-pick
git tag             git reset --hard        git stash
gh pr create        gh pr merge
```

Do not stage either — no `git add`. Leave every change in the working tree,
unstaged, exactly where it lands.

This holds **regardless of the circumstances**:

- No matter how small, safe, or obviously correct the change is
- No matter that the build passes and every test is green
- No matter that the work is finished and verified
- No matter that a previous message authorised a commit — **permission never
  carries forward**; it applies once, to that request only
- No matter that committing seems implied by the task

If you believe something should be committed, **say so and stop**. Describe what
you would commit and wait. Offering is correct; acting is not.

## Plans

Every implementation plan and design document belongs in the **`plans/`**
directory at the repository root — never in a scratch directory, temp path, or
any location outside the repo. A predictable path means any session, in any tool,
can find them.

`plans/` is **gitignored**: plans are local working notes, not committed
artifacts. They will not show up in `git status` and must never be staged.

Name files `NNN-kebab-case-title.md` with a zero-padded three-digit sequence
number, so the directory sorts in creation order by name:

```
plans/001-move-map-and-cars-to-backend.md
plans/002-...
```

Before writing a new plan, list `plans/` and take the next unused number. Do not
renumber or overwrite existing plans — supersede them with a new numbered file.

## Code reviews

**`code-review.md`** (repository root) is the only place review findings live. It
is **gitignored and generated** — a missing file is normal, not an error. These
rules are the authoritative copy; the file only mirrors them.

**"do a code review"** — review the changes, then write the findings to
`code-review.md`. **Create the file if it is missing**; if it exists,
**overwrite it**, removing the previous findings. The result always opens with
the Protocol section, then the findings.

Group by severity: **P1 correctness**, **P2 logic**, **P3 consistency**. Every
finding says what is wrong, **why**, and where as a `path:line` reference, with
measured evidence where possible. Always include a **What's done well** section.
Reviewing never includes fixing — those are separate requests.

**"fix the review"** — read `code-review.md` and implement it, highest severity
first, following the conventions above (placement, no comments, tests where this
file mandates them). **Skip any finding that does not hold up**: one that is
wrong, no longer applies, or whose fix costs more than the defect. Skipping is
expected and legitimate. At the end of the run, report explicitly **what was
fixed and what was skipped, with a reason for each skip** — never leave a skipped
finding unmentioned.

## Stack notes

- Backend: NestJS 11. DB is planned (TypeORM or Prisma + Postgres), but not yet added.
  `modules/app/` is leftover scaffolding that returns "Hello World!" — delete it
  when the first real feature module lands. Do not use it as a template.
- Frontend: Angular 21 + three.js. Single-player. The game route is lazy-loaded so
  three.js stays out of the initial bundle.
- `InputService` in `core/` tracks raw physical key codes (`event.code`, so WASD
  survives non-QWERTY layouts). Game-specific meaning is applied by
  `features/game/adapters/keyboard-input.ts`, not by the service.
- Verifying connection: `backend` runs on `:3000`, frontend on `:4200` with a `/api` proxy.