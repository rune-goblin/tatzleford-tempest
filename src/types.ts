import type { DIRECTIONS, ELEMENTS, LANDMARKS } from './constants';

export type Element = (typeof ELEMENTS)[number];

export type Dir8 = (typeof DIRECTIONS)[number];

/** 0 safe, 1 damaged, 2 destroyed. Presence of a key means the cell is painted. */
export type CellState = 0 | 1 | 2;

/** A coarse district cell, by column/row index. Anchored at scene (0,0). */
export interface Cell {
  i: number;
  j: number;
}

/** `"i,j"` — comma, never a dot: `foundry.utils.expandObject` splits dot paths. */
export type CellKey = string;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything the coarse-cell math needs, with no Foundry documents attached. */
export interface CoarseGrid {
  /** Scene rect in pixels. */
  sceneWidth: number;
  sceneHeight: number;
  /** Fine grid square, in pixels (33 on the Tatzlford map). */
  squarePx: number;
  /** Coarse cell edge, in fine squares. */
  cellSquares: number;
}

export interface LandmarkState {
  hits: number;
  durability: number;
}

export type LandmarkId = (typeof LANDMARKS)[number]['id'];

export interface LightningState {
  destroyed: boolean;
  /** Recent strike cells, newest last, capped at `LIGHTNING_HISTORY`. */
  strikes: Cell[];
}

export interface WindState {
  destroyed: boolean;
  pos: Cell | null;
  /** Recent positions, newest last, capped at `WIND_TRAIL_LENGTH`. */
  trail: Cell[];
  heading: Dir8;
}

export interface WaterState {
  destroyed: boolean;
  /** A contiguous 4-connected wall of cells. */
  front: Cell[];
  heading: Dir8;
}

export interface StormState {
  /** PRNG seed; each advance consumes it and persists its successor. */
  seed: number;
  round: number;
  lightning: LightningState;
  wind: WindState;
  water: WaterState;
}

export interface TempestSceneState {
  /** Frozen per-scene on first paint — changing it would invalidate every painted key. */
  cellSquares: number;
  cells: Record<CellKey, CellState>;
  landmarks: Record<string, LandmarkState>;
  storm: StormState;
}

/** Per-element state, keyed by element — the shape the planners and the console both index. */
export interface ElementStates {
  lightning: LightningState;
  wind: WindState;
  water: WaterState;
}

/** A seeded PRNG drawing from [0, 1). */
export type Rng = () => number;

/**
 * A planner is pure: same state, same painted cells, same rng sequence, same result. It must
 * not reference `foundry.*` — only `controller.ts` touches documents.
 */
export type Planner<S> = (state: S, painted: Cell[], rng: Rng) => S;

export type LightningPlanner = Planner<LightningState>;
export type WindPlanner = Planner<WindState>;
export type WaterPlanner = Planner<WaterState>;

/**
 * An ephemeral, GM-client-only advance. Rendered as a ghost until committed; a reload discards
 * it. `seed` is the successor seed the commit persists.
 */
export interface StormProposal {
  seed: number;
  round: number;
  /** `null` where the element is destroyed and did not move. */
  lightning: LightningState | null;
  wind: WindState | null;
  water: WaterState | null;
}

/**
 * Dot-path changes relative to the state root, merged into one `scene.update()`:
 * `{ 'cells.12,7': 1 }` to paint, `{ 'cells.-=12,7': null }` to unpaint.
 */
export type StateChanges = Record<string, unknown>;

export interface ModuleApi {
  version: string;
  /** Opens the GM console. Attached by `registerConsoleApi`. */
  openConsole: () => void;
  /** Activates the Tempest layer, or returns to the token layer if it is already active. */
  toggleLayer: () => void;
  /** Proposes an advance for every surviving element and commits it immediately. */
  advanceStorm: () => Promise<void>;
}
