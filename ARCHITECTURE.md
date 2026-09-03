# Architecture — Car Game

## Overview

A two-app monorepo:

- `backend/` — NestJS API. Currently a hello-world scaffold; no domain, no DB.
- `frontend/` — Angular 21 (standalone, signals, strict) + three.js. Single-player.

The frontend holds all the real code today (~270 LOC of game logic). This document
is weighted accordingly: most of it is about the game engine, and the backend
section is deliberately short because there is nothing there yet.

---

## Guiding principles

1. **Separate simulation from presentation.** The rules of the game are pure
   TypeScript. Rendering reads that state; it never owns it. This is the seam
   everything else hangs off.
2. **Dependencies point inward.** The engine defines the interfaces it needs.
   Outer layers (Angular, the browser, three.js) implement them. The engine
   imports nothing from Angular and the simulation imports nothing at all.
3. **Fold by feature, not by type.** No global `services/` or `models/`
   grab-bags. Each feature owns its files.
4. **Build structure when the code arrives, not before.** Empty folders for
   imagined features are a cost, not a plan. Where growth is anticipated, this
   document names the shape and the trigger — it does not scaffold it.
5. **Testability is the acceptance criterion for the layering.** If the vehicle
   dynamics cannot be tested in plain Node with no browser and no three.js, the
   boundary is in the wrong place.

---

## The central seam

The code this replaced had three classes doing several jobs each:

| Class | Jobs it did |
|-------|-------------|
| `Game` | renderer setup, lighting, camera follow, scene assembly, animation loop |
| `Car` | mesh construction, keyboard reading, movement integration |
| `GameMap` | track layout *and* the meshes that draw it |

None of it can be tested without a WebGL context and a keyboard. The fix is one
cut, applied consistently:

```
                    ┌──────────────────────────────┐
   input frame ───▶ │  sim/     (pure TypeScript)  │
                    │  world state, integration    │
                    │  no THREE · no Angular · no DOM │
                    └──────────────┬───────────────┘
                                   │  reads state (never mutates)
                                   ▼
                    ┌──────────────────────────────┐
                    │  render/  (three.js only)    │
                    │  scene, meshes, camera       │
                    └──────────────────────────────┘
```

`sim/` owns *what is true* about the world: where the car is, how fast, which way
it faces, what the track looks like as data. `render/` owns *how it looks*: meshes,
materials, lights, camera. State flows one way. Rendering is a pure function of
simulation state plus an interpolation factor.

The decomposition:

| Today | Becomes |
|-------|---------|
| `Car` (mesh + input + physics) | `sim/vehicle.ts` (dynamics) + `render/car-view.ts` (mesh) |
| `GameMap` (layout + meshes) | `sim/track.ts` (data) + `render/track-view.ts` (meshes) |
| `Game` (everything else) | `loop.ts` + `render/viewport.ts` + `render/scene.ts` + `render/camera-rig.ts` |

---

## Ports: how the engine stays framework-agnostic

The old `Car` imported `InputService`, which is `@Injectable` from
`@angular/core`. That single import chained the entire engine to Angular — the
principle "keep the engine framework-agnostic" could not survive it.

The engine instead declares what it needs, as plain types:

```ts
// engine/ports.ts
export interface InputFrame {
  throttle: number;  // -1 reverse … +1 forward
  steer: number;     // -1 right … +1 left
  brake: boolean;
}

export interface InputSource {
  read(): InputFrame;
}
```

`sim/vehicle.ts` consumes an `InputFrame` — a plain object. It has no idea
keyboards exist. The Angular side provides the implementation:

```ts
// features/game/adapters/keyboard-input.ts
@Injectable()
export class KeyboardInput implements InputSource { … }
```

The arrow now points inward: Angular depends on the engine, never the reverse.
Swapping in a gamepad, a touch overlay, a replay file, or a scripted test input
becomes a constructor argument rather than a refactor.

**`InputSource` is the only port needed today.** `AssetLoader` and `AudioSink`
follow the same pattern when models and sound arrive — not before.

### Why the keyboard adapter is not in `core/`

`core/` is for singletons genuinely shared across features — HTTP interceptors,
error handling, auth. Driving input belongs to the game feature and nothing else.
It lives in `features/game/adapters/`.

---

## The game loop

The old `Game.animate()` integrated against `clock.getDelta()`. Variable
timestep means the car handles differently at 30fps and 144fps, and the same
inputs produce different outcomes on different machines. For a driving game that
is a correctness bug, and fixing it is an architectural decision because it
determines the shape of the loop.

The loop runs the simulation on a **fixed timestep** and renders on an
**interpolated** one:

```ts
const FIXED_DT = 1 / 60;
const MAX_FRAME = 0.25;   // clamp: never spiral after a tab-switch stall

accumulator += Math.min(frameDelta, MAX_FRAME);

while (accumulator >= FIXED_DT) {
  previous = snapshot(world);
  world.step(FIXED_DT, input.read());
  accumulator -= FIXED_DT;
}

renderer.draw(previous, world, accumulator / FIXED_DT);
```

Three properties this buys, all of which the current loop lacks:

- **Determinism** — the same input sequence always produces the same result,
  which makes the simulation unit-testable and replays possible.
- **Frame-rate independence** — handling is identical on a 60Hz laptop and a
  144Hz monitor.
- **Smoothness** — rendering interpolates between the last two sim states, so
  visuals stay smooth even though physics ticks at a fixed rate.

The clamp matters: without it, returning to a backgrounded tab produces one huge
delta and the `while` loop stalls the page.

---

## Frontend structure

```
frontend/src/app/
├── app.ts / app.html / app.config.ts     # shell: router outlet only
├── app.routes.ts                          # lazy-loads the game feature
├── core/                                  # (empty today) app-wide singletons
├── shared/                                # (empty today) reusable dumb pieces
└── features/
    └── game/
        ├── game.component.ts/.html/.css   # Angular component: hosts the canvas
        ├── adapters/
        │   └── keyboard-input.ts          # implements engine's InputSource
        └── engine/                        # zero Angular imports
            ├── index.ts                   # public surface
            ├── engine.ts                  # composition root: wires sim + render
            ├── loop.ts                    # fixed-timestep accumulator
            ├── ports.ts                   # InputSource, InputFrame
            ├── sim/                        # zero THREE imports
            │   ├── types.ts               # Vec2, CarState
            │   ├── vehicle.ts             # throttle/steer/brake → position/heading
            │   └── track.ts               # track geometry as data
            └── render/                     # THREE lives here and only here
                ├── viewport.ts            # WebGLRenderer, container resize
                ├── scene.ts               # scene graph, lights, fog
                ├── camera-rig.ts          # follow camera
                ├── car-view.ts            # car mesh from CarState
                └── track-view.ts          # ground, roads, lane dashes
```

Both boundaries are mechanically checkable, and worth checking:

```
grep -rn "@angular" src/app/features/game/engine/       # must be empty
grep -rn "three"    src/app/features/game/engine/sim/   # must be empty
```

`core/` and `shared/` are listed to fix the convention, not to be created empty.
The first genuine cross-feature singleton creates `core/`.

**`sim/` uses its own small value types** (`{ x, z, heading }`), not
`THREE.Vector3`. The car moves on a plane, so 2D plus a heading is sufficient,
and it keeps the simulation genuinely dependency-free rather than
nearly-dependency-free.

---

## Angular integration

The shell renders a router outlet. `features/game/game.ts` owns the canvas host
element, constructs the engine in `ngAfterViewInit`, and disposes it in
`ngOnDestroy` — the same lifecycle discipline the current `App` has, moved to
where it belongs.

**The HUD must not update per frame.** Pushing speed and lap time into signals at
60fps triggers change detection 60 times a second and will dominate the frame
budget. The engine exposes a telemetry callback that the component samples on a
throttled interval (~10Hz is imperceptible for a speedometer) and writes into
signals. Rendering and change detection stay decoupled.

---

## Backend structure

The backend returns `"Hello World!"`. It gets a convention, not a plan.

**Convention:** one NestJS feature module per domain, each owning its own
controller, service, DTOs, and entities.

```
backend/src/
├── main.ts
├── app.module.ts          # imports feature modules
└── <feature>/             # created when the first real feature exists
```

`AppController` and `AppService` are scaffolding. When the first real endpoint
lands, they are **deleted**, not relocated into a `modules/app/` folder — moving
a placeholder into a feature-shaped home makes it look like a feature.

**Deferred:** ORM and database choice. There is nothing to persist yet, and
choosing now means choosing without the information that would make the choice
well-founded. Revisit when the first persisted entity is designed.

---

## Shared contracts

Two TypeScript apps in one repo will drift if their DTOs are maintained twice by
convention. The answer is an npm workspace package both sides import:

```
packages/contracts/     # request/response types shared by API and client
```

**Not built yet, deliberately.** The backend has no domain, so the package would
contain nothing. Creating it now buys an empty folder and a root `package.json`
restructure with no payoff.

**Trigger:** the first endpoint that returns a non-trivial payload. At that
point, add npm workspaces at the root and create the package — before the
duplicate type exists, not after.

---

## Testing strategy

This is what the layering is *for*, and it is the part that makes the whole
document worth executing:

| Layer | Tooling | Coverage target |
|-------|---------|-----------------|
| `sim/` | Vitest, plain Node, no jsdom | High. Fast, deterministic, no browser. |
| `loop.ts` | Vitest with an injected clock | Accumulator behaviour, stall clamping |
| `render/` | None beyond smoke tests | Low value, high cost. Verify visually. |
| Angular components | Vitest + jsdom | Lifecycle, disposal, HUD wiring |
| Backend | Vitest/Jest per Nest defaults | When there is a domain to test |

Two tests worth writing first, because they encode the properties the
architecture exists to guarantee:

- **Determinism** — feed a fixed input sequence through `world.step()` at fixed
  dt twice; assert byte-identical resulting state.
- **Frame-rate independence** — one hundred steps at `1/60` and the equivalent
  elapsed time driven through the loop at a simulated 144fps land the car in the
  same place, within epsilon.

Neither is possible against the current code. Both are trivial after the split.

---

## Migration status

Steps 1–6 are **done**. `Game`, `Car`, and `GameMap` are deleted; their
responsibilities live in `sim/` and `render/`. 30 tests pass, both apps build,
and both layer boundaries are enforced by the greps above.

| # | Step | Status |
|---|------|--------|
| 1 | Extract the simulation into `sim/` | Done |
| 2 | Determinism + frame-rate independence tests | Done |
| 3 | Extract `render/` from `Game` | Done |
| 4 | Invert the input dependency behind `InputSource` | Done |
| 5 | Fixed-timestep loop with clamp and interpolation | Done |
| 6 | Angular shell reduced to a router outlet; game lazy-loaded | Done |
| 7 | Backend cleanup | Deferred — `modules/app/` stays until a real feature exists |

### Deviations from the plan as written

Recorded because the structure above is what shipped, not what was sketched:

- **No `sim/world.ts`.** It would hold `{ car, track }` and nothing else, so
  `engine.ts` holds them directly. `World` earns its own file when a second
  simulated entity arrives — traffic, obstacles, or checkpoints.
- **`render/renderer.ts` is called `viewport.ts`**, because it owns the canvas
  element and its resize observer, not just the `WebGLRenderer`. It sizes to the
  container rather than to `window`, which the old code got wrong.
- **The component keeps the name `game.component.ts`** rather than being renamed
  to `game.ts`. The rename is cosmetic and the churn is not worth it.
- **`KeyboardInput` is a plain class, not an `@Injectable`.** It takes a
  `KeyState` in its constructor, so it is testable with no `TestBed`.
  `InputService` stays in `core/` tracking raw physical key codes; the adapter
  applies the game-specific meaning.
- **The loop compares against `fixedDelta - 1e-9`.** Float `1/60` is slightly
  larger than the true value, so sixty of them exceed one second and a naive
  comparison drops a step per second. A test caught this.
- **No HUD.** Nothing produces telemetry yet, so there is nothing to display.
  The throttled-signal approach in the Angular Integration section still stands
  for when there is.

---

## Deferred decisions

| Decision | Trigger |
|----------|---------|
| ORM + database | First entity that needs persisting |
| `packages/contracts` workspace | First non-trivial API payload |
| `core/` and `shared/` folders | First genuine cross-feature singleton |
| Asset pipeline / `AssetLoader` port | First external model or texture |
| Audio (`AudioSink` port) | First sound |
| Multiplayer | Out of scope. The sim/render split is what would make it feasible later — the simulation is already pure and portable to Node — but nothing is built for it now. |
