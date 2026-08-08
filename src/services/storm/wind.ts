import { DIRECTIONS, WIND_STEP_RANGE, WIND_TRAIL_LENGTH, WIND_TURN_WEIGHTS } from '../../constants';
import { cellKey, cellsEqual, step } from '../grid';
import type { Cell, Dir8, Rng, WindState } from '../../types';
import { nearestCell } from './cells';
import { pick, randomInt, weightedPick } from './rng';

/** `DIRECTIONS` runs clockwise, so one index is 45°: +1 turns right, -1 turns left. */
const TURN_STEPS = { straight: 0, left: -1, right: 1 } as const;

/** Turn magnitudes tried when the chosen heading is blocked, nearest turn first. */
const DEFLECTIONS = [1, 2, 3, 4] as const;

export function turn(heading: Dir8, steps: number): Dir8 {
  const index = DIRECTIONS.indexOf(heading);
  return DIRECTIONS[(((index + steps) % DIRECTIONS.length) + DIRECTIONS.length) % DIRECTIONS.length];
}

/**
 * The vortex planner: continue or turn ±45° (weighted 60/20/20), then walk 1–2 cells, stopping at
 * the town's edge. A blocked heading deflects to the nearest heading that has somewhere to go.
 */
export function planWind(state: WindState, painted: Cell[], rng: Rng): WindState {
  if (painted.length === 0) return state;
  const town = new Set(painted.map(cellKey));

  if (!state.pos) return arrive(state, pick(rng, painted), state.heading);
  // A GM nudge can park the vortex off the painted region; walk it back rather than stranding it.
  if (!town.has(cellKey(state.pos))) return arrive(state, nearestCell(state.pos, painted, rng), state.heading);

  const heading = turn(state.heading, TURN_STEPS[weightedPick(rng, WIND_TURN_WEIGHTS)]);
  const distance = randomInt(rng, WIND_STEP_RANGE.min, WIND_STEP_RANGE.max);

  const straight = walk(state.pos, heading, distance, town);
  if (!cellsEqual(straight, state.pos)) return arrive(state, straight, heading);

  // Sweep the deflections from a random side so the vortex has no standing clockwise bias.
  const side = rng() < 0.5 ? 1 : -1;
  for (const magnitude of DEFLECTIONS) {
    for (const sign of [side, -side]) {
      const deflected = turn(heading, sign * magnitude);
      const cell = walk(state.pos, deflected, 1, town);
      if (!cellsEqual(cell, state.pos)) return arrive(state, cell, deflected);
    }
  }

  return arrive(state, state.pos, heading);
}

/** Walks up to `distance` cells, stopping before the first cell outside the painted region. */
function walk(from: Cell, heading: Dir8, distance: number, town: Set<string>): Cell {
  let cell = from;
  for (let taken = 0; taken < distance; taken++) {
    const next = step(cell, heading);
    if (!town.has(cellKey(next))) break;
    cell = next;
  }
  return cell;
}

/** The trail's newest entry is always the current position, so the renderer draws one path. */
function arrive(state: WindState, pos: Cell, heading: Dir8): WindState {
  return { ...state, pos, heading, trail: [...state.trail, pos].slice(-WIND_TRAIL_LENGTH) };
}
