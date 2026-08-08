import { DIRECTION_VECTORS, WATER_FRONT_LENGTH } from '../../constants';
import { cellKey } from '../grid';
import type { Cell, Dir8, Rng, WaterState } from '../../types';
import { nearestCell } from './cells';
import { pick, randomInt } from './rng';

/** A unit vector along the wall. Always orthogonal, so a run of cells is 4-connected by construction. */
interface Axis {
  di: number;
  dj: number;
}

const MIN_LENGTH = Math.max(1, WATER_FRONT_LENGTH - 1);
const MAX_LENGTH = WATER_FRONT_LENGTH + 1;

/** A wall stands across its heading: any eastward or westward component makes it a vertical run. */
export function wallAxis(heading: Dir8): Axis {
  return DIRECTION_VECTORS[heading].di !== 0 ? { di: 0, dj: 1 } : { di: 1, dj: 0 };
}

/**
 * The flood-wall planner. The wall translates one step along its heading, its ends jitter ±1, and
 * the result is re-fitted inside the painted region: it slides along the town's boundary, and only
 * shortens or holds position when no slide fits. Damage state is irrelevant — the wall traverses
 * every painted cell freely.
 */
export function planWater(state: WaterState, painted: Cell[], rng: Rng): WaterState {
  if (painted.length === 0) return state;
  const town = new Set(painted.map(cellKey));
  const axis = wallAxis(state.heading);

  if (state.front.length === 0) return { ...state, front: seedFront(painted, axis, town, rng) };

  const origin = originOf(centroid(state.front), axis, state.front.length);
  const lo = randomInt(rng, -1, 1);
  const hi = randomInt(rng, -1, 1);
  const wanted = clampLength(state.front.length - lo + hi);
  const heading = DIRECTION_VECTORS[state.heading];

  for (const forward of [1, 0]) {
    const base = offset(
      { i: origin.i + heading.di * forward, j: origin.j + heading.dj * forward },
      axis,
      lo,
    );
    const front = fit(base, axis, wanted, town);
    if (front) return { ...state, front };
  }

  // Erasing the cells under the wall strands it; re-form it on the painted cell nearest its middle.
  const anchor = nearestCell(centroid(state.front), painted, rng);
  return { ...state, front: fit(originOf(anchor, axis, wanted), axis, wanted, town) ?? [anchor] };
}

/**
 * The best placement whose whole run is painted: full length first (the wall slides rather than
 * breaks up), then progressively shorter, each length swept outwards from the requested position.
 */
function fit(base: Cell, axis: Axis, wanted: number, town: Set<string>): Cell[] | null {
  for (let length = wanted; length >= 1; length--) {
    for (const shift of slides(length + 1)) {
      const cells = run(offset(base, axis, shift), axis, length);
      if (cells.every((cell) => town.has(cellKey(cell)))) return cells;
    }
  }
  return null;
}

/** 0, +1, -1, +2, -2 … — nearest placement first, capped so the wall never teleports across town. */
function slides(reach: number): number[] {
  const offsets = [0];
  for (let n = 1; n <= reach; n++) offsets.push(n, -n);
  return offsets;
}

/** First placement of the wall: a random painted cell becomes its middle. */
function seedFront(painted: Cell[], axis: Axis, town: Set<string>, rng: Rng): Cell[] {
  const middle = pick(rng, painted);
  return fit(originOf(middle, axis, WATER_FRONT_LENGTH), axis, WATER_FRONT_LENGTH, town) ?? [middle];
}

function run(origin: Cell, axis: Axis, length: number): Cell[] {
  return Array.from({ length }, (_, n) => ({ i: origin.i + axis.di * n, j: origin.j + axis.dj * n }));
}

function offset(cell: Cell, axis: Axis, distance: number): Cell {
  return { i: cell.i + axis.di * distance, j: cell.j + axis.dj * distance };
}

/** Re-deriving the origin from the middle lets the wall rotate cleanly when its heading changes. */
function originOf(middle: Cell, axis: Axis, length: number): Cell {
  return offset(middle, axis, -Math.floor((length - 1) / 2));
}

function centroid(cells: Cell[]): Cell {
  const i = cells.reduce((sum, cell) => sum + cell.i, 0) / cells.length;
  const j = cells.reduce((sum, cell) => sum + cell.j, 0) / cells.length;
  return { i: Math.round(i), j: Math.round(j) };
}

function clampLength(length: number): number {
  return Math.min(Math.max(length, MIN_LENGTH), MAX_LENGTH);
}
