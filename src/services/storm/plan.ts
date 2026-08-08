import { cellsEqual } from '../grid';
import type { Cell, Element, StormProposal, StormState } from '../../types';
import { planLightning } from './lightning';
import { mulberry32, nextSeed } from './rng';
import { planWater } from './water';
import { planWind } from './wind';

/**
 * Assembles one proposal from committed storm state. Pure, so the whole engine is testable without
 * Foundry; `controller.ts` supplies the state and the painted cells.
 *
 * A reroll seeds from `previous.seed` — the successor the last run produced — so rerolling gives a
 * different outcome while a given committed seed always replays the same first proposal. With
 * `only` set, the other elements are carried over untouched and never draw from the stream.
 */
export function planAdvance(
  storm: StormState,
  painted: Cell[],
  previous?: StormProposal,
  only?: Element,
): StormProposal {
  const rng = mulberry32(previous?.seed ?? storm.seed);
  const carry = (element: Element) => Boolean(previous && only && only !== element);

  const lightning = carry('lightning')
    ? (previous?.lightning ?? null)
    : storm.lightning.destroyed
      ? null
      : planLightning(storm.lightning, painted, rng);

  const wind = carry('wind')
    ? (previous?.wind ?? null)
    : storm.wind.destroyed
      ? null
      : planWind(storm.wind, painted, rng);

  const water = carry('water')
    ? (previous?.water ?? null)
    : storm.water.destroyed
      ? null
      : planWater(storm.water, painted, rng);

  return { seed: nextSeed(rng.seed), round: previous?.round ?? storm.round + 1, lightning, wind, water };
}

/** Shifts one element of a proposal by one cell. Translation keeps the flood wall contiguous. */
export function nudgeElement(proposal: StormProposal, element: Element, di: number, dj: number): StormProposal {
  const shift = (cell: Cell): Cell => ({ i: cell.i + di, j: cell.j + dj });

  if (element === 'lightning') {
    const state = proposal.lightning;
    if (!state || state.strikes.length === 0) return proposal;
    const strikes = [...state.strikes.slice(0, -1), shift(state.strikes[state.strikes.length - 1])];
    return { ...proposal, lightning: { ...state, strikes } };
  }

  if (element === 'wind') {
    const state = proposal.wind;
    if (!state?.pos) return proposal;
    const pos = shift(state.pos);
    const last = state.trail[state.trail.length - 1];
    // The trail's newest entry is the current position; drag it along rather than leaving a stub.
    const trail = last && cellsEqual(last, state.pos) ? [...state.trail.slice(0, -1), pos] : [...state.trail, pos];
    return { ...proposal, wind: { ...state, pos, trail } };
  }

  const state = proposal.water;
  if (!state || state.front.length === 0) return proposal;
  return { ...proposal, water: { ...state, front: state.front.map(shift) } };
}
