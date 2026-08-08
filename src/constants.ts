export const MODULE_ID = 'tatzleford-tempest';

/**
 * The element triad. Every three-way structure in the module keys off these three strings:
 * the `Element` union, `flags.tatzleford-tempest.element` on each Tempest actor, the
 * `tatzleford-tempest.element.*` i18n keys, and the motion planners. Frozen — do not reorder.
 */
export const ELEMENTS = ['lightning', 'wind', 'water'] as const;

export const FLAG_SCOPE = MODULE_ID;
export const FLAG_STATE_KEY = 'state';
export const FLAG_ELEMENT_KEY = 'element';

/** Dot path to the scene-state root, the prefix for every `scene.update()` write. */
export const STATE_PATH = `flags.${FLAG_SCOPE}.${FLAG_STATE_KEY}`;

/** `CONFIG.Canvas.layers` key; the canvas attaches the layer at `canvas[LAYER_NAME]`. */
export const LAYER_NAME = 'tatzlefordTempest';

/** Scene-control group key and the ids of its tools. */
export const CONTROL_GROUP = LAYER_NAME;
export const CONTROL_TOOLS = { paint: 'paint', damage: 'damage', console: 'console' } as const;

/** Stable DOM id of the GM console window, for e2e selectors. */
export const CONSOLE_ID = `${MODULE_ID}-console`;

export const SETTINGS = {
  defaultCellSquares: 'defaultCellSquares',
  playerVisible: 'playerVisible',
  landmarkLabels: 'landmarkLabels',
  overlayOpacity: 'overlayOpacity',
} as const;

/**
 * Module-internal hooks. `updateScene`/`updateActor` land in the controller, which fans out
 * through these so the layer and the console never import each other. `proposalChanged` runs the
 * other way — the console announces its ephemeral ghost and the layer draws it.
 */
export const HOOKS = {
  stateChanged: `${MODULE_ID}.stateChanged`,
  elementDown: `${MODULE_ID}.elementDown`,
  settingChanged: `${MODULE_ID}.settingChanged`,
  proposalChanged: `${MODULE_ID}.proposalChanged`,
} as const;

export const DEFAULT_CELL_SQUARES = 12;
export const MIN_CELL_SQUARES = 6;
export const MAX_CELL_SQUARES = 24;
export const DEFAULT_PLAYER_VISIBLE = true;
export const DEFAULT_LANDMARK_LABELS = true;
export const DEFAULT_OVERLAY_OPACITY = 0.6;

export const CELL_STATES = { safe: 0, damaged: 1, destroyed: 2 } as const;

/** Fill colour and alpha per cell state; `safe` is outline-only, hence alpha 0. */
export const CELL_COLORS = { 0: 0xffffff, 1: 0xf2c14e, 2: 0xc0392b } as const;
export const CELL_ALPHAS = { 0: 0, 1: 0.35, 2: 0.4 } as const;

export const GRID_LINE_COLOR = 0xffffff;
export const GRID_LINE_ALPHA = 0.15;
export const GHOST_COLOR = 0xffffff;
export const GHOST_ALPHA = 0.5;

export const ELEMENT_COLORS = {
  lightning: 0x8fd3ff,
  wind: 0xd7c9ff,
  water: 0x4aa3df,
} as const;

/** How much recent motion each element keeps for rendering, and the flood front's width. */
export const LIGHTNING_HISTORY = 4;
export const WIND_TRAIL_LENGTH = 6;
export const WATER_FRONT_LENGTH = 3;

/** Weights for the vortex planner: continue, turn +45°, turn -45°. */
export const WIND_TURN_WEIGHTS = { straight: 0.6, left: 0.2, right: 0.2 } as const;
export const WIND_STEP_RANGE = { min: 1, max: 2 } as const;

/** PF2e measured-template geometry for the hazard's three routines (Section 5). */
export const TEMPLATES = {
  thunderclap: { t: 'circle', distance: 30, areaShape: 'burst' },
  rendingDeluge: { t: 'cone', distance: 30, angle: 90, areaShape: 'cone' },
  queensLightning: { t: 'circle', distance: 5, areaShape: 'burst' },
} as const;

/**
 * Pre-minted document ids shared by the actor pack and the scene pack, so token `actorId`s
 * and `@UUID` links resolve without the two authoring passes negotiating.
 */
export const ACTOR_IDS = {
  lightning: 'TempestLghtnPWdk',
  wind: 'TempestVortxMTah',
  water: 'TempestDelugZgnu',
  hazard: 'QueensTempstmt07',
} as const;

/** The GM guide's `_id`, preserved by the Adventure's keepId import, so it can be opened on arrival. */
export const GM_GUIDE_ID = 'TempestGMGuide01';

export type LandmarkRole = 'bridge' | 'keepWall' | 'ordinary';

export interface LandmarkDefinition {
  /** Key into `state.landmarks` and into `tatzleford-tempest.landmarks.*`. */
  id: string;
  /** The scene note's label, for GMs matching the tracker against the map. */
  note: string;
  durability: number;
  role: LandmarkRole;
}

export const DEFAULT_DURABILITY = 3;

/**
 * Section 6: the design doc's durability table mapped onto the scene's 11 notes. The doc's
 * Temple and Mill have no Tatzlford counterpart and are omitted.
 */
export const LANDMARKS: readonly LandmarkDefinition[] = [
  { id: 'skunk-river-bridge', note: 'A5. Skunk River Bridge', durability: 2, role: 'bridge' },
  { id: 'tatzlford-fort', note: 'A9. Tatzlford Fort and Town Hall', durability: 3, role: 'keepWall' },
  { id: 'ables-inn', note: "A1. Able's Inn", durability: 3, role: 'ordinary' },
  { id: 'gnoris-gems', note: "A2. Gnori's Gems", durability: 3, role: 'ordinary' },
  { id: 'ironhand-smithy', note: 'A3. Ironhand Smithy', durability: 3, role: 'ordinary' },
  { id: 'river-run-alehouse', note: 'A4. River Run Alehouse', durability: 3, role: 'ordinary' },
  { id: 'general-store', note: 'A6. Tatzlford General Store', durability: 3, role: 'ordinary' },
  { id: 'tatzlford-library', note: 'A7. Tatzlford Library', durability: 3, role: 'ordinary' },
  { id: 'tatzlford-lodge', note: 'A8. Tatzlford Lodge', durability: 3, role: 'ordinary' },
  { id: 'tatzlwyrm-tavern', note: 'A10. Tatzlwyrm Tavern', durability: 3, role: 'ordinary' },
  { id: 'thrillseekers', note: 'A11. Thrillseekers', durability: 3, role: 'ordinary' },
] as const;

/** Compass headings, clockwise from north — the order the console's 8-way nudge pad renders in. */
export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

/** Column/row deltas per heading, in coarse cells. */
export const DIRECTION_VECTORS = {
  n: { di: 0, dj: -1 },
  ne: { di: 1, dj: -1 },
  e: { di: 1, dj: 0 },
  se: { di: 1, dj: 1 },
  s: { di: 0, dj: 1 },
  sw: { di: -1, dj: 1 },
  w: { di: -1, dj: 0 },
  nw: { di: -1, dj: -1 },
} as const;
