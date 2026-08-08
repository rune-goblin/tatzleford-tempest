# The Queen's Tempest — implementation plan

Module `tatzleford-tempest` turns the design doc at `tatzlford-source/Tempest-design`
into a shippable Foundry v14 PF2e module: a GM-painted coarse district grid with
per-cell damage markers on a custom PIXI layer, three moving storm areas with
GM-reviewable random motion, one-click PF2e measured templates for the hazard's
creature-facing effects, and a compendium-packaged encounter (scene, 3 NPC actors,
1 hazard actor, macros, GM journal).

**Deliberately out of scope** (user decisions): no automation of saves, damage,
conditions, or forced movement — the GM resolves everything through PF2e's normal
cards; no sector-level damage automation — the GM toggles cell states and narrates;
no auto-derivation of the town shape — the GM paints it.

## 1. The element triad

The storm has three elements, and every three-way structure in the module keys off
one identifier set:

| Identifier | Actor | Hazard routine (1d3) | Map behaviour |
|---|---|---|---|
| `lightning` | Lightning Tempest | 2 — Queen's Lightning | Discrete strikes jumping to random points |
| `wind` | Vortex Tempest | 1 — Thunderclap | A vortex tracing a random path across cells |
| `water` | Deluge Tempest | 3 — Rending Deluge | A flood wall sweeping across the map |

**Chosen identifiers: `lightning` / `wind` / `water`.** Element names outlive
creature names — the wind manifestation has already been renamed once — and they
namespace cleanly: `ELEMENTS` union, `tatzleford-tempest.element.wind.*` i18n keys,
`flags.tatzleford-tempest.element = 'wind'` on the actor, the `wind` planner in the
motion engine. Every Wave 2 agent codes against these exact three strings; the
contract task (W1-contract) freezes them in `src/constants.ts`.

**Rename record:** the source design doc calls the wind manifestation "Thunder
Tempest". The canonical name everywhere in this module — actor JSON, pack sources,
localization, constants, layer behaviour id — is **Vortex Tempest**. Token art
already exists under the new name (`tatzlford-source/vortex-tempest.webp`).

## 2. Verified API surface (foundry-pf2e typedefs)

All names below were confirmed in `node_modules/foundry-pf2e/types/`; paths cited
so executors can re-check signatures.

- **`foundry.canvas.layers.CanvasLayer`** and **`foundry.canvas.layers.InteractionLayer`**
  — `foundry/client/canvas/layers/base/{canvas-layer,interaction-layer}.d.mts`,
  exported via `layers/_module.d.mts`; `foundry.canvas` is exported from
  `client/_module.d.mts:74`. `InteractionLayer` provides `activate()/deactivate()`,
  `_draw(options)`, and the interaction handlers we need: `_onClickLeft`,
  `_onDragLeftStart/Move/Drop/Cancel`, `_onClickRight`. `CanvasLayerOptions` is
  `{ name, baseClass, zIndex }` via `static get layerOptions()`.
- **`CONFIG.Canvas.layers`** — `foundry/client/config.d.mts:578` — a record of
  `{ group: 'primary' | 'interface' | 'effects', layerClass }`. Custom layers
  register by adding an entry on `init`. The typedef is a closed interface, so the
  assignment needs a cast. The canvas attaches each layer at `canvas[<key>]` — use
  key **`tatzlefordTempest`** (no hyphens; it becomes a property name).
- **`getSceneControlButtons`** hook — `foundry/client/helpers/hooks.d.mts:50` —
  signature `(controls: Record<string, SceneControl>)`. **Record, not array** (the
  v13+ shape). `SceneControl` / `SceneControlTool` —
  `foundry/client/applications/ui/scene-controls.d.mts` — `tools` is a
  `Record<string, SceneControlTool>`; both carry `order`; tools have
  `toggle`/`button`/`onChange`.
- **`InteractionLayer.static prepareSceneControls(): SceneControl | null`** exists
  (`interaction-layer.d.mts:48`), but whether core auto-invokes it for
  module-registered layers is **not verified** — the plan uses the
  `getSceneControlButtons` hook, which is guaranteed.
- **`MeasuredTemplateDocument`** — ambient global (`global-external.d.mts`),
  schema in `foundry/common/documents/measured-template.d.mts`: `t`, `x`, `y`,
  `distance`, `direction`, `angle`, `width`, `fillColor`, `flags`.
  `CONST.MEASURED_TEMPLATE_TYPES` = `circle | cone | rect | ray`
  (`foundry/common/constants.d.mts:1108`). Created as a Scene embedded document:
  `canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [data])`.
- **PF2e template flavor** — `pf2e/module/scene/measured-template-document.d.ts`:
  `MeasuredTemplateDocumentPF2e` carries `flags.pf2e.areaShape: EffectAreaShape`,
  where `EFFECT_AREA_SHAPES = ['burst','cone','cube','cylinder','emanation','line','square']`
  (`pf2e/module/item/values.d.ts:30`). Set `areaShape: 'burst'` on the 60-ft
  circle and `'cone'` on the 30-ft cone so PF2e renders/highlights them natively.
- **Grid math** — `foundry.grid.SquareGrid` (`foundry/common/grid/square.d.mts`,
  exported as `foundry.grid` from `client/_module.d.mts:45`): `getOffset(coords)`,
  `getOffsetRange(bounds)`, `getTopLeftPoint(coords)`, `getCenterPoint(coords)`.
  These serve the fine 33-px grid; the coarse district grid is our own arithmetic
  (Section 3) — do not conflate the two.
- **Hooks used**: `init` (register settings + layer), `canvasReady` (first draw),
  `updateScene` (flag-diff fan-out to every client), `updateActor` (Tempest HP
  watch), `getSceneControlButtons`.

## 3. Coarse grid geometry

Scene `tatzlford-source/fvtt-Scene-tatzlford-mwfd7BmKNrAGVuXy.json`: 7200×4800 px,
square grid, `grid.size` 33 px = 5 ft, padding 0. 7200/33 = 218.18 and
4800/33 = 145.45 — the fine grid itself doesn't divide the map evenly; that is
baked into the original scene and harmless (Foundry tolerates a partial last
column of squares).

**Default cell size: 12 scene squares = 60 ft = 396 px**, world setting
`defaultCellSquares` (range 6–24). Justification: the largest routine area, the
Thunderclap 60-ft burst, spans exactly one cell, and the 30-ft cone fits inside
one; the town core (roughly 3700×2000 px between Tatzlford Lodge and Ironhand
Smithy) becomes ≈ 45–55 painted cells — enough spatial variety for random
targeting, paintable in under a minute with drag-paint, and legible zoomed out
(18 columns across the full map). The coarse lattice anchors at scene (0,0):
18 full columns + a 72-px remainder column, 12 full rows + a 48-px remainder row.
Partial edge cells are clipped to the scene rect and remain paintable — they are
forest edge and will stay inert in practice.

**Upscaling: recommended against.** To make 12-square cells divide the map you
would resize the art to a multiple of 396 px (7524×5148, a 4.5 % upscale) — but
the art was drawn at 33 px = 5 ft, so either the fine grid then disagrees with
building footprints (keep 33 px) or every distance on the map silently grows
(scale the grid with it). The only thing an integer fit buys is removing two
partial edge cell rows that sit in inert forest. No upscale; keep the exported
scene dimensions.

Cell coordinates are `(i, j)` column/row indices; the flag encodes them as the
string key `"i,j"` (comma, never a dot — dots would split under
`foundry.utils.expandObject` during `Scene#update`).

## 4. Persistence and sync

Per `references/multi-client-sync.md`: document-flag propagation is the sync
channel; no raw socket, no `"socket": true` in module.json. The GM is the only
writer (paint tools and console are GM-gated), so no version locks.

**Scene flag** — one root key, `scene.flags['tatzleford-tempest'].state`:

```ts
interface TempestSceneState {
  cellSquares: number;              // frozen per-scene on first paint
  cells: Record<string, CellState>; // "i,j" -> 0 safe | 1 damaged | 2 destroyed; presence = painted/active
  landmarks: Record<string, { hits: number; durability: number }>;
  storm: {
    seed: number;                   // PRNG seed; advances deterministically
    round: number;
    lightning: { destroyed: boolean; strikes: Cell[] };       // recent strike cells, newest last
    wind:      { destroyed: boolean; pos: Cell | null; trail: Cell[]; heading: Dir8 };
    water:     { destroyed: boolean; front: Cell[]; heading: Dir8 };
  };
}
```

Validated at read time by a `foundry.abstract.DataModel` subclass
(`TempestStateModel`, `static defineSchema()` with `foundry.data.fields.*`). The
model is a thin wrapper: all decision logic lives in pure modules so vitest can
run it without the `foundry` global (DataModel itself cannot load under Node).

Writes go through `scene.update()` with dot paths
(`'flags.tatzleford-tempest.state.cells.12,7': 1`; unpaint with the `-=` deletion
key). Foundry broadcasts `updateScene` to every client; each client's layer
redraws from the new flag and the console store refreshes. That is the whole sync
story — committed state only.

**Storm proposals are ephemeral, GM-client memory.** A proposed advance renders as
a ghost on the GM's layer only; players never see it, and a GM reload discards it.
Committing writes the flag (and only then does the map change for players). This
keeps preview churn out of the document update stream.

**World settings** (`game.settings.register`, scope `world`):
`defaultCellSquares` (12), `playerVisible` (true — hide the whole overlay from
players when false). **Client setting:** `overlayOpacity` (0.6).
**Actor flag:** `flags.tatzleford-tempest.element: 'lightning' | 'wind' | 'water'`
authored into each Tempest actor's pack JSON, so code finds the actors without
hardcoding ids.

## 5. Layer, motion, and templates — behaviour spec

**TempestLayer** (`extends foundry.canvas.layers.InteractionLayer`, group
`interface`, registered in `init` as `CONFIG.Canvas.layers.tatzlefordTempest`).
Renders, in order: coarse grid lines over painted region (subtle), painted-cell
fills (safe = faint outline, damaged = yellow ≈ 0.35 alpha, destroyed = red ≈
0.4 alpha), storm graphics (lightning strike marks fading over the last N
strikes; vortex spiral + trail; flood front as a thick contiguous band), then
GM-only proposal ghosts (dashed). ≤ ~250 cells means one `PIXI.Graphics` rebuild
per state change — no perf work needed. Scene-control group (via
`getSceneControlButtons`, GM-only `visible`): tools **paint** (left-drag paints,
right-drag erases), **damage** (left-click cycles safe→damaged→destroyed,
right-click reverses), and a **console** button tool whose `onChange` calls
`game.modules.get(MODULE_ID).api.openConsole()` — the button goes through the
public API precisely so the layer task never imports console code.

**Motion planners** — pure functions in `src/services/storm/`, seeded PRNG
(mulberry32; seed persisted in the flag) so advances are deterministic and
unit-testable. Each planner: `(state, paintedCells, rng) → proposal`.

- `water` (flood wall): state is a contiguous 4-connected front of cells (default
  length 3) plus a heading (8-way). Advance moves each front cell one step along
  the heading with ±1 lateral jitter at the ends, preserving contiguity; cells
  that would exit the painted region slide along its boundary instead — the
  "smooshing" the user described. Traverses damaged/destroyed cells freely.
- `wind` (vortex): state is one cell + heading. Advance: continue / turn ±45°
  weighted 60/20/20, step 1–2 cells, clamped to painted cells; keeps a trail of
  the last ~6 cells for rendering.
- `lightning`: advance samples one strike cell uniformly from painted cells,
  excluding the immediately previous strike; keeps the last ~4 strikes for
  fading render marks.

**Advance flow:** console "Propose" runs the planners → ghost preview on the GM
layer with per-element **Reroll** and 8-way **Nudge** buttons → **Commit** writes
the flag (one `scene.update`). Direct drag-editing of proposals on canvas is a
reserved judgment call (Section 9); v1 ships reroll + nudge.

**Templates** (`src/services/templates.ts`): console buttons arm a one-shot
click-to-place on the layer, then `canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [...])`:

- Thunderclap: `{ t: 'circle', distance: 30, flags: { pf2e: { areaShape: 'burst' } } }` (60-ft burst = 30-ft radius).
- Rending Deluge: `{ t: 'cone', distance: 30, angle: 90, direction, flags: { pf2e: { areaShape: 'cone' } } }` — direction from a second click (origin → aim).
- Queen's Lightning: single target, no area in the doc; v1 places a 5-ft-radius
  `circle` marker at the strike point (reserved judgment, Section 9).

Templates are placed, never resolved: no saves, no damage application.

**GM console** (`TempestConsoleApp`, ApplicationV2 shell + Svelte 5 per
`references/svelte-in-applicationv2.md`; state in a runes store
`src/ui/console/state.svelte.ts` refreshed from `updateScene`): per-element
status row (alive/destroyed toggle; an indicator lights when `updateActor` sees a
Tempest actor at 0 HP — marking destroyed stays manual), Propose/Reroll/Nudge/
Commit, the three template buttons, a "roll random painted cell" button (the
doc's random-sector roll, over painted cells), damage tallies, and the landmark
tracker (hit pips against durability).

## 6. Landmark mapping

The scene's 11 note landmarks map onto the design doc's durability table
(`W1-contract` freezes this as a `LANDMARKS` constant; the console seeds
`state.landmarks` from it):

| Doc target | Durability | Scene landmark |
|---|---:|---|
| Bridge | 2 | A5. Skunk River Bridge |
| Keep Wall | 3 | A9. Tatzlford Fort and Town Hall |
| Temple | 2 | **no counterpart on this map** |
| Mill | 2 | **no counterpart on this map** |
| Ordinary sector | 3 | the other 9 landmarks (Able's Inn, Tatzlford Library, Gnori's Gems, Ironhand Smithy, River Run Alehouse, Tatzlwyrm Tavern, Tatzlford General Store, Tatzlford Lodge, Thrillseekers) and unnamed cells |

Temple and Mill have no Tatzlford counterpart — flagged for the user (Section 9);
they ship omitted unless the user assigns stand-ins.

## 7. Distribution: one Adventure pack

**Recommendation: ship a derived Adventure pack**, per `references/packs-cli.md`.
This module is exactly the "world to run" case: one scene with placed Tempest
tokens, actors those tokens link to, macros calling the module API, and a GM
journal cross-linking them. keepId import preserves every `_id`, so token→actor
links and `@UUID` refs survive on every install; loose compendium import would
mint new ids and break them. The known cost — imported docs are copies that go
stale on module update — is acceptable for a one-shot encounter; stat-block
errata means "re-import the adventure". No `_library/` pack is needed (nothing is
granted in place by compendium UUID).

Mechanically (template tooling): author per-type sources under
`packs/_source/{actors,scenes,macros,journals}/`, register a single
`Adventure`-type pack in `module.json` `"packs"`, and `npm run build` derives it
via `scripts/build-adventure.ts`. The W3-integrate executor reads
`scripts/pack.ts` + `scripts/build-adventure.ts` before touching `module.json`
registration (whether the existing `macros` compendium registration is replaced
or kept alongside is decided against the scripts' actual behaviour, not guessed).

**Licensing flag (user must confirm):** the scene's background is
`modules/pf2e-kingmaker/assets/maps-regions/tatzlford/background.webp` (stored at
`levels[0].background.src` in the export) — **premium Kingmaker AP art**. A local
copy sits at `tatzlford-source/background.webp` (7200×4800). The module must
**not** ship that file without the user confirming redistribution rights. Plan
default: the packed scene keeps referencing the `pf2e-kingmaker` module path, so
owners of the premium module see the map and others see a black scene; the local
copy stays out of `assets/`. The compass tile (also `pf2e-kingmaker`) is dropped.
The Tempest token art (`vortex/lightning/deluge-tempest.webp`) appears to be
user-generated and ships in `assets/`.

**Scene source prep:** the export's 29 tokens are campaign armies/NPCs linking to
`pf2e-kingmaker` / `pf2e-reignmaker` actors — the adventure build would drop them
as unbundled anyway; strip them at source. Also strip the `world-explorer` flag,
the leftover "Heal" spell region, the world journal ref (`hg9Bztz48jKxb8K6`), and
the single leftover drawing. Add three placed Tempest tokens linked to the
bundled actors, positioned per the doc's GM guidance: Vortex at the fort/central
streets, Lightning near the library/towers, Deluge at Skunk River Bridge.

## 8. Waves and tasks

A wave is a set of tasks safe to run concurrently by independent subagents; waves
run in sequence. **File-ownership rule:** within a wave, no two tasks touch the
same file. Shared files (`src/constants.ts`, `src/types.ts`, `src/index.ts`,
`lang/en.json`, `module.json`, the `register.ts` / controller stubs) are written
by W1-contract, then frozen until W3-integrate — Wave 2 agents that want a new
i18n key or constant record it in their task notes for W3 instead of editing.

Wave 1 makes parallelism possible: it deletes the example scaffolding, freezes
the element triad and every cross-boundary interface, and pre-creates typed stubs
(functions with final signatures throwing `not implemented`) at each seam —
`src/layer/register.ts`, `src/ui/console/register.ts`,
`src/services/storm/controller.ts` — so `src/index.ts` is written **once** in its
final form and Wave 2 agents fill their own stub without touching anyone else's
files.

### Wave 1 — shared contract (1 task)

**W1-contract**
- **Files created:** `src/types.ts` (Element union, `Cell`, `CellState`, `Dir8`,
  `TempestSceneState`, planner and controller interfaces, `ModuleApi`),
  `src/data/TempestStateModel.ts` (DataModel + `defineSchema`),
  `src/settings.ts` (full implementation — three settings, Section 4),
  `src/services/grid.ts` (pure coarse-cell math: px↔cell, cell rect clipped to
  scene rect, painted-cell enumeration) + `src/tests/unit/grid.test.ts`,
  `src/services/storm/controller.ts` (typed stub: `proposeAdvance`,
  `commitAdvance`, `readState`, `writeState`),
  `src/layer/register.ts` (stub `registerLayer()`),
  `src/ui/console/register.ts` (stub `registerConsoleApi(api)`),
  `lang/en.json` (complete key skeleton for every subsystem, real English strings).
- **Files modified:** `src/constants.ts` (MODULE_ID + `ELEMENTS`, `FLAG_SCOPE`,
  `FLAG_STATE_KEY = 'state'`, `SETTINGS` keys, `LAYER_NAME = 'tatzlefordTempest'`,
  `LANDMARKS` table from Section 6, cell/color constants, and `ACTOR_IDS` — four
  pre-minted 16-char document ids for the three Tempests and the hazard, so
  W2-actors and W2-scene agree on `_id`/`actorId` without talking to each
  other), `src/index.ts` (final
  wiring: init → settings + `registerLayer()`; ready → api assembly +
  `registerConsoleApi`; hooks for `updateScene`/`updateActor` delegating to
  stubs). Runs `npm run remove-example-files` first (deletes `src/ui/ExampleApp.ts`,
  example components, example specs, macro source).
- **Acceptance:** `npm run check` and `npm test` green (grid tests real, stubs
  compile); no `example` files remain; `ELEMENTS` is exactly
  `['lightning','wind','water']`.
- **Depends on:** nothing.

### Wave 2 — parallel implementation (5 tasks, all depend only on W1-contract)

**W2-layer** — the PIXI overlay.
- **Files created:** `src/layer/TempestLayer.ts`, `src/layer/render.ts`
  (Graphics drawing: grid, cell fills, storm marks, proposal ghosts),
  `src/layer/controls.ts` (`getSceneControlButtons` registration, tool defs).
- **Files modified:** `src/layer/register.ts` (fill the stub:
  `CONFIG.Canvas.layers` entry with cast, hook registrations, `canvasReady`
  draw, redraw on `updateScene` flag diff).
- **Notes:** paint/damage interactions per Section 5; respects `playerVisible`
  and `overlayOpacity`; console button routes through `api.openConsole()` —
  **no import from `src/ui/`**. Reads/writes flags via `controller.ts`
  signatures only.
- **Acceptance:** `npm run check` green; `npm run build` green; unit test for
  any extracted pure render-geometry helpers.

**W2-engine** — motion planners + controller.
- **Files created:** `src/services/storm/rng.ts` (mulberry32),
  `src/services/storm/{lightning,wind,water}.ts` (planners per Section 5),
  `src/tests/unit/{rng,lightning,wind,water}.test.ts`.
- **Files modified:** `src/services/storm/controller.ts` (fill the stub:
  read flag → validate via `TempestStateModel` → run planners → proposal;
  commit → single `scene.update`). Planners stay pure (no `foundry.*`
  references); only `controller.ts` touches documents.
- **Acceptance:** `npm test` green — determinism under a fixed seed, water front
  stays contiguous and inside painted cells, wind stays inside painted cells,
  lightning never repeats the immediately previous cell; `npm run check` green.

**W2-console** — GM console UI + template service.
- **Files created:** `src/ui/console/TempestConsoleApp.ts` (ApplicationV2 shell,
  mount-once pattern from `references/svelte-in-applicationv2.md`),
  `src/ui/console/TempestConsole.svelte`, `src/ui/console/components/*.svelte`
  (element rows, landmark tracker, storm controls), `src/ui/console/state.svelte.ts`
  (runes store fed by `updateScene`), `src/services/templates.ts` (Section 5
  template placement + one-shot click-to-place arming).
- **Files modified:** `src/ui/console/register.ts` (fill the stub: attach
  `openConsole` to the api object).
- **Notes:** calls `controller.ts` by its W1 signatures; every `.svelte` file is
  validated with `npx -y @sveltejs/mcp svelte-autofixer <file>`; i18n keys from
  the W1 skeleton only (new-key needs → task notes for W3).
- **Acceptance:** `npm run check` green (svelte-check included); `npm run build`
  green; autofixer clean.

**W2-actors** — the four pack actors.
- **Files created:** `packs/_source/actors/lightning-tempest.json`,
  `packs/_source/actors/vortex-tempest.json`,
  `packs/_source/actors/deluge-tempest.json`,
  `packs/_source/actors/queens-tempest.json` (hazard).
- **Notes:** PF2e `npc` and `hazard` schemas copied from live system sources —
  `_pf2e-source/pf2e/packs/pf2e/hazards/*.json` (e.g. `banshees-symphony.json`
  for a complex hazard: `system.details.{isComplex,routine,disable,reset}`,
  `system.attributes.stealth`) and any current bestiary for NPCs (strikes as
  `melee` items, abilities as `action` items). Stat values verbatim from
  `tatzlford-source/Tempest-design`: shared chassis (AC 34, Fort +27/Ref +25/
  Will +22, Perception +25, Athletics +27, resistance physical 10 except magical,
  fly 60 ft, traits Unique/Large/Air/Elemental/Primal/Water) merged into each;
  Vortex HP 245 + storm hammer/Thunder Pulse/Draw the Sky/Rolling Echo; Lightning
  HP 205 + lightning lash/Forked Lightning/Ride the Bolt/Static Field/Arc Flash;
  Deluge HP 225 + crushing wave/Flash Flood/Undertow/Drown the Streets. Hazard:
  level 16, complex, Stealth +0, routine/disable/Storm Intervention text with
  inline `@Check[...|dc:38]` / `@Damage[8d10[sonic]]` enrichers per the doc's
  three effects. Each Tempest gets `flags.tatzleford-tempest.element`; every doc
  gets a stable `_id` and `_key: '!actors!<id>'`; token images point at
  `modules/tatzleford-tempest/assets/tokens/<element>-tempest.webp`.
  **Vortex Tempest keeps the doc's sonic mechanics unchanged** (Section 9, Q1).
- **Acceptance:** `npm run build` compiles the pack without errors; a value
  spot-check against the design doc's Quick Reference passes (HP triple 245/205/
  225, all DCs 35/38, durabilities untouched).

**W2-scene** — scene, journal, macros, assets.
- **Files created:** `packs/_source/scenes/queens-tempest-tatzlford.json`
  (transformed export per Section 7: strip foreign tokens/region/journal/drawing/
  compass tile, keep the `pf2e-kingmaker` background path, add 3 Tempest tokens
  whose `actorId`s are the pre-assigned ids from `src/constants.ts`),
  `packs/_source/journals/gm-guide.json` (Round Flow, Storm Intervention DCs,
  Running the Tempests, Ending the Encounter — condensed from the design doc,
  `@UUID` links to the four actors), `packs/_source/macros/{open-console,
  toggle-layer,advance-storm}.json` (thin `game.modules.get('tatzleford-tempest').api.*`
  calls), `assets/tokens/{vortex,lightning,deluge}-tempest.webp` (moved from
  `tatzlford-source/`).
- **Files deleted:** `packs/_source/macros/open-example.json` if
  `remove-example-files` left it.
- **Acceptance:** `npm run build` compiles; scene JSON has `_key`, zero tokens
  referencing non-bundled actors, no `world-explorer` flags; assets exist at the
  referenced paths.

*(Collision audit for Wave 2: the five tasks' file sets are disjoint. The only
shared artifacts — the actor `_id`s used by both W2-actors and W2-scene — are
frozen as `ACTOR_IDS` literals by W1-contract, not negotiated between agents.)*

### Wave 3 — integration (1 task)

**W3-integrate**
- **Files modified:** `module.json` (register the `Adventure` pack per
  `scripts/pack.ts` / `scripts/build-adventure.ts` behaviour; correct `title` to
  "The Queen's Tempest at Tatzlford" and `description`), `src/index.ts` (wire
  `promptAdventureImport()` from `src/adventure.ts` on `ready`;
  `openJournalOnImport(<gm-guide id>)` on `init`), `lang/en.json` (fold in every
  key recorded in Wave 2 task notes; final copy pass), plus any seam fixes the
  merged waves surface (type drift between controller and console, layer redraw
  hook ordering).
- **Acceptance:** `npm run check`, `npm test`, `npm run build` all green; `packs/`
  contains the derived Adventure LevelDB; `grep -r 'not implemented' src/` finds
  nothing; `grep -ri 'thunder tempest' src lang packs/_source` finds nothing
  (the doc-history line in the journal may reference it deliberately — exempt).
- **Depends on:** all of Wave 2.

### Wave 4 — verification (1 task)

**W4-verify**
- Runs `npm run check`, `npm test`, `npm run build`; fixes what they surface.
- **Authors one Playwright spec**, `src/tests/e2e/tempest.spec.ts`, per
  `references/testing.md` conventions (gmPage fixture, `__e2e_` prefixed
  throwaway docs, cleanup in `afterEach`, one operation per file). Worth writing
  because the layer and flag round-trip genuinely need live Foundry: assert
  `CONFIG.Canvas.layers.tatzlefordTempest` exists and `canvas.tatzlefordTempest`
  is drawn, `api.openConsole()` renders the ApplicationV2 element (stable id
  selector), and a scene-flag paint write round-trips (`scene.update` a cell →
  read back via `getFlag` → layer state reflects it). Assert via `page.evaluate`
  on `game`/API state, not canvas pixels. Run it if a licensed Foundry +
  `TEST_WORLD` are available (`npm run test:e2e`); otherwise deliver the spec
  with `npm run check:e2e` green and note it unexecuted.
- **Produces a manual QA checklist** (in the task report, not a repo file): paint
  the town, cycle damage states on both clients, propose/reroll/commit each
  element, place all three templates, import the Adventure into a fresh world and
  confirm token→actor links.
- **Depends on:** W3-integrate.

**Concurrency shape: 1 → 5 → 1 → 1** (Wave 2 is the wide wave; content authoring,
the PIXI layer, the motion engine, and the console UI are independent once the
contract exists).

## 9. Reserved judgment calls and open questions

Decisions deliberately left to the user (U) or the executing agent (E):

1. **(U) Vortex Tempest's sonic kit.** The doc's kit is sonic-flavoured (Thunder
   Pulse, Rolling Echo, storm hammer's 2d8 sonic; hazard result 1 "Thunderclap"),
   which sits oddly under a wind-named vortex. **Recommendation: keep the
   mechanics exactly as written and rename only** — the shared chassis already
   carries the Air trait, thunder is what a vortex sounds like, and a reskin
   (sonic → bludgeoning, sonic trait → air) changes resistances interactions.
   Either way, HP 245, AC 34, +27 attack, and all DCs/dice stay untouched.
   W2-actors ships rename-only unless the user says otherwise.
2. **(U) Temple and Mill** durability targets have no Tatzlford counterpart.
   Assign stand-ins (Tatzlford Lodge? the Library?) or ship without them
   (current plan: without).
3. **(U) Map background licensing** — confirm whether the Kingmaker Tatzlford art
   may ship. Until confirmed the module references the `pf2e-kingmaker` path and
   ships no background file (Section 7). Also confirm the fate of the 29 stripped
   campaign tokens (armies from `pf2e-reignmaker`/`pf2e-kingmaker`) — they do not
   ship.
4. **(E) Queen's Lightning marker** — the doc targets one creature with no area;
   v1 places a 5-ft-radius circle as a visible strike marker. Drop it if it reads
   as a real area in play.
5. **(E) Proposal editing** — v1 is reroll + 8-way nudge from the console;
   drag-to-move ghosts on canvas is a follow-up if nudge feels clumsy.
6. **(E) Element-destroyed automation** — `updateActor` at 0 HP lights an
   indicator only; the GM flips the destroyed toggle. Auto-flip is a one-line
   change if the user prefers it.
7. **(E) `prepareSceneControls`** — if the executor verifies core auto-invokes the
   static for module-registered layers in v14, it may replace the
   `getSceneControlButtons` hook; until verified, the hook stands.
8. **(E) Scene `thumb`** — the export's thumb is stale; decide whether to null it
   and let Foundry regenerate on import.
9. **(E) Hazard actor image** — no art exists for the Queen's Tempest hazard;
   default icon vs. reusing storm art.
10. **(E) `cellSquares` immutability** — changing a scene's cell size after
    painting invalidates painted keys; v1 freezes it at first paint and the
    console says so. A repaint-migration is out of scope.
11. **(Recorded decision)** No map upscale (Section 3); the user may override,
    accepting a 4.5 % art resample and a redrawn fine grid.
