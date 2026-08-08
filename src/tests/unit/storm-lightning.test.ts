import { describe, expect, it } from 'vitest';
import { LIGHTNING_HISTORY } from '@/constants';
import { cellKey, cellsEqual } from '@/services/grid';
import { planLightning } from '@/services/storm/lightning';
import { mulberry32 } from '@/services/storm/rng';
import type { Cell, LightningState } from '@/types';

/** A 4×3 block of painted cells. */
const town: Cell[] = [];
for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) town.push({ i, j });

const fresh: LightningState = { destroyed: false, strikes: [] };

function sequence(seed: number, painted: Cell[], rounds: number): LightningState[] {
  const rng = mulberry32(seed);
  const states: LightningState[] = [];
  let state = fresh;
  for (let round = 0; round < rounds; round++) {
    state = planLightning(state, painted, rng);
    states.push(state);
  }
  return states;
}

describe('planLightning', () => {
  it('replays identically from the same seed', () => {
    expect(sequence(777, town, 30)).toEqual(sequence(777, town, 30));
  });

  it('diverges on a different seed', () => {
    expect(sequence(777, town, 30)).not.toEqual(sequence(778, town, 30));
  });

  it('always strikes a painted cell', () => {
    const painted = new Set(town.map(cellKey));
    for (const state of sequence(3, town, 200)) {
      expect(painted.has(cellKey(state.strikes[state.strikes.length - 1]))).toBe(true);
    }
  });

  it('never repeats the immediately previous strike', () => {
    for (const state of sequence(3, town, 400)) {
      if (state.strikes.length < 2) continue;
      const [previous, latest] = state.strikes.slice(-2);
      expect(cellsEqual(previous, latest)).toBe(false);
    }
  });

  it('reaches every painted cell given enough rounds', () => {
    const struck = new Set(sequence(9, town, 500).map((state) => cellKey(state.strikes[state.strikes.length - 1])));
    expect(struck.size).toBe(town.length);
  });

  it('keeps only the last few strikes', () => {
    const states = sequence(1, town, 50);
    expect(states[states.length - 1].strikes).toHaveLength(LIGHTNING_HISTORY);
    expect(states[0].strikes).toHaveLength(1);
  });

  it('restrikes the only cell of a one-cell town', () => {
    const single = [{ i: 5, j: 5 }];
    const states = sequence(2, single, 5);
    expect(states[states.length - 1].strikes.every((cell) => cellsEqual(cell, single[0]))).toBe(true);
  });

  it('leaves the state alone with nothing painted', () => {
    const state = { destroyed: false, strikes: [{ i: 1, j: 1 }] };
    expect(planLightning(state, [], mulberry32(1))).toBe(state);
  });
});
