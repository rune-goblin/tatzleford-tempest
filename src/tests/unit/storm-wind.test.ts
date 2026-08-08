import { describe, expect, it } from 'vitest';
import { DIRECTIONS, WIND_TRAIL_LENGTH } from '@/constants';
import { cellDistance, cellKey, cellsEqual } from '@/services/grid';
import { mulberry32 } from '@/services/storm/rng';
import { planWind, turn } from '@/services/storm/wind';
import type { Cell, Dir8, WindState } from '@/types';

/** A 6×5 block of painted cells. */
const town: Cell[] = [];
for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) town.push({ i, j });

const start: WindState = { destroyed: false, pos: { i: 2, j: 2 }, trail: [{ i: 2, j: 2 }], heading: 'e' };

function sequence(seed: number, painted: Cell[], rounds: number, from: WindState = start): WindState[] {
  const rng = mulberry32(seed);
  const states: WindState[] = [];
  let state = from;
  for (let round = 0; round < rounds; round++) {
    state = planWind(state, painted, rng);
    states.push(state);
  }
  return states;
}

describe('turn', () => {
  it('rotates 45° per step, clockwise for positive', () => {
    expect(turn('n', 1)).toBe('ne');
    expect(turn('n', -1)).toBe('nw');
    expect(turn('n', 0)).toBe('n');
  });

  it('wraps in both directions', () => {
    expect(turn('nw', 1)).toBe('n');
    expect(turn('n', -4)).toBe('s');
    expect(turn('e', 8)).toBe('e');
  });
});

describe('planWind', () => {
  it('replays identically from the same seed', () => {
    expect(sequence(4242, town, 50)).toEqual(sequence(4242, town, 50));
  });

  it('diverges on a different seed', () => {
    expect(sequence(4242, town, 50)).not.toEqual(sequence(4243, town, 50));
  });

  it('never leaves the painted cells', () => {
    const painted = new Set(town.map(cellKey));
    for (const state of sequence(11, town, 500)) expect(painted.has(cellKey(state.pos as Cell))).toBe(true);
  });

  it('stays inside a ragged region', () => {
    const ragged = town.filter((cell) => cell.i + cell.j !== 4 && !(cell.i === 5 && cell.j === 0));
    const painted = new Set(ragged.map(cellKey));
    for (const state of sequence(12, ragged, 500, { ...start, pos: ragged[0] })) {
      expect(painted.has(cellKey(state.pos as Cell))).toBe(true);
    }
  });

  it('steps at most two cells per round', () => {
    let previous = start.pos as Cell;
    for (const state of sequence(13, town, 300)) {
      expect(cellDistance(previous, state.pos as Cell)).toBeLessThanOrEqual(2);
      previous = state.pos as Cell;
    }
  });

  it('keeps a heading from the eight compass points', () => {
    for (const state of sequence(14, town, 200)) expect(DIRECTIONS).toContain(state.heading as Dir8);
  });

  it('caps the trail and ends it on the current position', () => {
    for (const state of sequence(15, town, 40)) {
      expect(state.trail.length).toBeLessThanOrEqual(WIND_TRAIL_LENGTH);
      expect(cellsEqual(state.trail[state.trail.length - 1], state.pos as Cell)).toBe(true);
    }
    expect(sequence(15, town, 40).pop()?.trail).toHaveLength(WIND_TRAIL_LENGTH);
  });

  it('holds its heading most of the time', () => {
    let straight = 0;
    let previous = start.heading;
    for (const state of sequence(16, town, 2000)) {
      if (state.heading === previous) straight++;
      previous = state.heading;
    }
    // 60 % continue, minus the deflections a bounded town forces at its edges.
    expect(straight / 2000).toBeGreaterThan(0.4);
  });

  it('places an unplaced vortex inside the painted region', () => {
    const painted = new Set(town.map(cellKey));
    const [first] = sequence(17, town, 1, { destroyed: false, pos: null, trail: [], heading: 'n' });
    expect(painted.has(cellKey(first.pos as Cell))).toBe(true);
    expect(first.trail).toEqual([first.pos]);
  });

  it('walks a nudged-away vortex back to the town edge', () => {
    const stranded: WindState = { destroyed: false, pos: { i: 9, j: 2 }, trail: [], heading: 'e' };
    const [first] = sequence(18, town, 1, stranded);
    expect(first.pos?.i).toBe(5);
    expect(cellDistance(stranded.pos as Cell, first.pos as Cell)).toBe(4);
  });

  it('stays put in a one-cell town', () => {
    const single = [{ i: 3, j: 3 }];
    for (const state of sequence(19, single, 20, { ...start, pos: single[0] })) {
      expect(state.pos).toEqual(single[0]);
    }
  });

  it('follows a one-cell-wide corridor', () => {
    const corridor = Array.from({ length: 6 }, (_, i) => ({ i, j: 0 }));
    const painted = new Set(corridor.map(cellKey));
    for (const state of sequence(20, corridor, 200, { ...start, pos: corridor[0] })) {
      expect(painted.has(cellKey(state.pos as Cell))).toBe(true);
    }
  });

  it('leaves the state alone with nothing painted', () => {
    expect(planWind(start, [], mulberry32(1))).toBe(start);
  });
});
