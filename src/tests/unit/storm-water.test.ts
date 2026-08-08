import { describe, expect, it } from 'vitest';
import { WATER_FRONT_LENGTH } from '@/constants';
import { cellKey } from '@/services/grid';
import { mulberry32 } from '@/services/storm/rng';
import { planWater, wallAxis } from '@/services/storm/water';
import type { Cell, Dir8, WaterState } from '@/types';

function block(columns: number, rows: number): Cell[] {
  const cells: Cell[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) cells.push({ i, j });
  return cells;
}

/** A 8×6 town with a bite taken out of one corner and a notch in its east wall. */
const ragged = block(8, 6).filter(
  (cell) => !(cell.i < 2 && cell.j < 2) && !(cell.i === 7 && cell.j >= 2 && cell.j <= 3),
);

function start(front: Cell[], heading: Dir8 = 'e'): WaterState {
  return { destroyed: false, front, heading };
}

function sequence(seed: number, painted: Cell[], rounds: number, from: WaterState): WaterState[] {
  const rng = mulberry32(seed);
  const states: WaterState[] = [];
  let state = from;
  for (let round = 0; round < rounds; round++) {
    state = planWater(state, painted, rng);
    states.push(state);
  }
  return states;
}

/** 4-connected: consecutive cells differ by exactly one, on exactly one axis. */
function contiguous(front: Cell[]): boolean {
  return front.every((cell, index) => {
    if (index === 0) return true;
    const previous = front[index - 1];
    return Math.abs(cell.i - previous.i) + Math.abs(cell.j - previous.j) === 1;
  });
}

describe('wallAxis', () => {
  it('stands the wall across its heading', () => {
    expect(wallAxis('e')).toEqual({ di: 0, dj: 1 });
    expect(wallAxis('w')).toEqual({ di: 0, dj: 1 });
    expect(wallAxis('n')).toEqual({ di: 1, dj: 0 });
    expect(wallAxis('s')).toEqual({ di: 1, dj: 0 });
  });

  it('resolves a diagonal heading onto its horizontal component', () => {
    expect(wallAxis('ne')).toEqual({ di: 0, dj: 1 });
    expect(wallAxis('sw')).toEqual({ di: 0, dj: 1 });
  });
});

describe('planWater', () => {
  const wall = [
    { i: 1, j: 1 },
    { i: 1, j: 2 },
    { i: 1, j: 3 },
  ];

  it('replays identically from the same seed', () => {
    expect(sequence(31, ragged, 60, start(wall))).toEqual(sequence(31, ragged, 60, start(wall)));
  });

  it('diverges on a different seed', () => {
    expect(sequence(31, ragged, 60, start(wall))).not.toEqual(sequence(32, ragged, 60, start(wall)));
  });

  for (const heading of ['e', 'w', 'n', 's', 'ne', 'sw', 'se', 'nw'] as Dir8[]) {
    it(`stays contiguous and painted heading ${heading}`, () => {
      const painted = new Set(ragged.map(cellKey));
      for (const state of sequence(40, ragged, 300, start(wall, heading))) {
        expect(contiguous(state.front)).toBe(true);
        expect(state.front.every((cell) => painted.has(cellKey(cell)))).toBe(true);
        expect(state.front.length).toBeGreaterThan(0);
      }
    });
  }

  it('keeps the wall near its default length in open ground', () => {
    for (const state of sequence(41, block(12, 9), 300, start(wall))) {
      expect(state.front.length).toBeGreaterThanOrEqual(WATER_FRONT_LENGTH - 1);
      expect(state.front.length).toBeLessThanOrEqual(WATER_FRONT_LENGTH + 1);
    }
  });

  it('sweeps across the town rather than sitting still', () => {
    const columns = sequence(42, block(12, 9), 12, start(wall)).map((state) => state.front[0].i);
    expect(Math.max(...columns)).toBeGreaterThan(Math.min(...columns) + 4);
  });

  it('smooshes along the boundary once it reaches the far wall', () => {
    const painted = new Set(block(6, 6).map(cellKey));
    const late = sequence(43, block(6, 6), 60, start(wall)).slice(-30);
    for (const state of late) {
      expect(state.front.every((cell) => painted.has(cellKey(cell)))).toBe(true);
      expect(state.front.every((cell) => cell.i === 5)).toBe(true);
    }
  });

  it('shortens to fit a region narrower than the front', () => {
    const corridor = Array.from({ length: 8 }, (_, i) => ({ i, j: 4 }));
    const painted = new Set(corridor.map(cellKey));
    for (const state of sequence(44, corridor, 60, start(wall))) {
      expect(state.front).toHaveLength(1);
      expect(painted.has(cellKey(state.front[0]))).toBe(true);
    }
  });

  it('keeps its full length in a corridor it fits across', () => {
    const corridor = Array.from({ length: 8 }, (_, i) => ({ i, j: 4 }));
    for (const state of sequence(45, corridor, 30, start([{ i: 0, j: 4 }], 'n'))) {
      expect(state.front.length).toBeGreaterThanOrEqual(WATER_FRONT_LENGTH - 1);
      expect(contiguous(state.front)).toBe(true);
    }
  });

  it('seeds an empty front inside the painted region', () => {
    const painted = new Set(block(8, 6).map(cellKey));
    const [first] = sequence(46, block(8, 6), 1, start([]));
    expect(first.front).toHaveLength(WATER_FRONT_LENGTH);
    expect(first.front.every((cell) => painted.has(cellKey(cell)))).toBe(true);
    expect(contiguous(first.front)).toBe(true);
  });

  it('collapses onto a one-cell town', () => {
    const single = [{ i: 4, j: 4 }];
    for (const state of sequence(47, single, 10, start(wall))) expect(state.front).toEqual(single);
  });

  it('re-forms a wall stranded by an erased district', () => {
    const painted = new Set(ragged.map(cellKey));
    const stranded = start([
      { i: 20, j: 20 },
      { i: 20, j: 21 },
    ]);
    const [first] = sequence(48, ragged, 1, stranded);
    expect(first.front.every((cell) => painted.has(cellKey(cell)))).toBe(true);
    expect(contiguous(first.front)).toBe(true);
  });

  it('leaves the state alone with nothing painted', () => {
    const state = start(wall);
    expect(planWater(state, [], mulberry32(1))).toBe(state);
  });
});
