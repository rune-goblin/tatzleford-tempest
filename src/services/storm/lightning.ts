import { LIGHTNING_HISTORY } from '../../constants';
import { cellsEqual } from '../grid';
import type { Cell, LightningState, Rng } from '../../types';
import { pick } from './rng';

/**
 * The lightning planner: one uniform strike over the painted cells, never the cell struck last
 * round. Pure — the controller decides whether a destroyed element gets planned at all.
 */
export function planLightning(state: LightningState, painted: Cell[], rng: Rng): LightningState {
  if (painted.length === 0) return state;

  const last = state.strikes[state.strikes.length - 1];
  const fresh = last ? painted.filter((cell) => !cellsEqual(cell, last)) : painted;
  // A one-cell town leaves nowhere else to strike.
  const strike = pick(rng, fresh.length > 0 ? fresh : painted);

  return { ...state, strikes: [...state.strikes, strike].slice(-LIGHTNING_HISTORY) };
}
