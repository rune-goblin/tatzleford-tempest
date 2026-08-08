import { describe, expect, it } from 'vitest';
import { coarseGrid } from '@/services/grid';
import {
  damageMultiplier,
  degreeKeys,
  elementCells,
  isStormAnchor,
  newlyOccupied,
  rectsOverlap,
  tokensInCells,
  type ElementCells,
  type TokenFootprint,
} from '@/services/storm/zones';
import type { Cell, WindState } from '@/types';

/** The Tatzlford map: 33-px squares, 12 squares to a coarse cell, so cells are 396 px. */
const grid = coarseGrid({ width: 7200, height: 4800, grid: { size: 33 } }, 12);
const CELL = 396;

function token(id: string, x: number, y: number, squares = 1): TokenFootprint {
  return { id, name: id, rect: { x, y, width: squares * 33, height: squares * 33 } };
}

function state(overrides: Partial<ElementCells>): ElementCells {
  return {
    lightning: { destroyed: false, strikes: [] },
    wind: { destroyed: false, pos: null, trail: [], heading: 'n' },
    water: { destroyed: false, front: [], heading: 'e' },
    ...overrides,
  };
}

describe('elementCells', () => {
  it('takes the newest strike, the vortex cell, and the whole flood wall', () => {
    const source = state({
      lightning: { destroyed: false, strikes: [{ i: 1, j: 1 }, { i: 4, j: 2 }] },
      wind: { destroyed: false, pos: { i: 3, j: 3 }, trail: [{ i: 2, j: 3 }], heading: 'e' },
      water: { destroyed: false, front: [{ i: 5, j: 0 }, { i: 5, j: 1 }], heading: 'e' },
    });

    expect(elementCells(source, 'lightning')).toEqual([{ i: 4, j: 2 }]);
    expect(elementCells(source, 'wind')).toEqual([{ i: 3, j: 3 }]);
    expect(elementCells(source, 'water')).toEqual([{ i: 5, j: 0 }, { i: 5, j: 1 }]);
  });

  it('is empty for a destroyed element whose proposal is null', () => {
    expect(elementCells({ lightning: null, wind: null, water: null }, 'water')).toEqual([]);
  });
});

describe('newlyOccupied', () => {
  it('returns only the cells the flood wall moved onto', () => {
    const before = state({ water: { destroyed: false, front: [{ i: 2, j: 1 }, { i: 2, j: 2 }], heading: 'e' } });
    const after = state({ water: { destroyed: false, front: [{ i: 2, j: 2 }, { i: 2, j: 3 }], heading: 'e' } });

    expect(newlyOccupied(before, after, 'water')).toEqual([{ i: 2, j: 3 }]);
  });

  it('sweeps nothing when the vortex holds its cell', () => {
    const held: WindState = { destroyed: false, pos: { i: 6, j: 6 }, trail: [{ i: 6, j: 6 }], heading: 'n' };
    expect(newlyOccupied(state({ wind: held }), state({ wind: held }), 'wind')).toEqual([]);
  });

  it('counts a re-entered cell as new once the element has left it', () => {
    const before = state({ lightning: { destroyed: false, strikes: [{ i: 1, j: 1 }, { i: 9, j: 9 }] } });
    const after = state({ lightning: { destroyed: false, strikes: [{ i: 9, j: 9 }, { i: 1, j: 1 }] } });

    expect(newlyOccupied(before, after, 'lightning')).toEqual([{ i: 1, j: 1 }]);
  });
});

describe('rectsOverlap', () => {
  const cell = { x: 0, y: 0, width: CELL, height: CELL };

  it('is false for rects that only share an edge', () => {
    expect(rectsOverlap({ x: CELL, y: 0, width: 33, height: 33 }, cell)).toBe(false);
  });

  it('is true for any shared area', () => {
    expect(rectsOverlap({ x: CELL - 1, y: 0, width: 33, height: 33 }, cell)).toBe(true);
  });
});

describe('tokensInCells', () => {
  const zone: Cell[] = [{ i: 1, j: 0 }];

  it('catches a Medium token standing inside the cell', () => {
    const inside = token('inside', CELL + 100, 100);
    expect(tokensInCells([inside], zone, grid).map((t) => t.id)).toEqual(['inside']);
  });

  it('misses a Medium token one square outside the cell', () => {
    const outside = token('outside', CELL - 33, 100);
    expect(tokensInCells([outside], zone, grid)).toEqual([]);
  });

  it('catches a Large token straddling the boundary where a Medium token at the same corner is missed', () => {
    const large = token('large', CELL - 33, 100, 2);
    const medium = token('medium', CELL - 33, 100);

    expect(tokensInCells([large, medium], zone, grid).map((t) => t.id)).toEqual(['large']);
  });

  it('catches a Large token whose centre lies outside the swept cell', () => {
    const large = token('large', CELL - 60, 100, 2);
    const centre = large.rect.x + large.rect.width / 2;

    expect(centre).toBeLessThan(CELL);
    expect(tokensInCells([large], zone, grid).map((t) => t.id)).toEqual(['large']);
  });

  it('catches nothing when the element swept no new cells', () => {
    expect(tokensInCells([token('anyone', CELL + 100, 100)], [], grid)).toEqual([]);
  });

  it('catches a token standing in any one of several swept cells', () => {
    const front: Cell[] = [{ i: 1, j: 0 }, { i: 1, j: 1 }];
    const low = token('low', CELL + 10, CELL + 10);
    expect(tokensInCells([low], front, grid).map((t) => t.id)).toEqual(['low']);
  });
});

describe('isStormAnchor', () => {
  it('excludes any actor carrying the element flag', () => {
    expect(isStormAnchor('wind')).toBe(true);
    expect(isStormAnchor('lightning')).toBe(true);
    expect(isStormAnchor('water')).toBe(true);
  });

  it('includes everyone else', () => {
    expect(isStormAnchor(undefined)).toBe(false);
    expect(isStormAnchor(null)).toBe(false);
    expect(isStormAnchor('')).toBe(false);
  });
});

describe('damageMultiplier', () => {
  it('follows the basic-save ladder, by PF2e degree index', () => {
    expect(damageMultiplier(0)).toBe(2);
    expect(damageMultiplier(1)).toBe(1);
    expect(damageMultiplier(2)).toBe(0.5);
    expect(damageMultiplier(3)).toBe(0);
  });

  it('has no multiplier where no save was rolled', () => {
    expect(damageMultiplier(null)).toBeNull();
    expect(damageMultiplier(4)).toBeNull();
  });
});

describe('degreeKeys', () => {
  it('pairs each degree with its damage wording', () => {
    expect(degreeKeys(0)).toEqual({ degree: 'criticalFailure', multiplier: 'double' });
    expect(degreeKeys(3)).toEqual({ degree: 'criticalSuccess', multiplier: 'none' });
    expect(degreeKeys(null)).toBeNull();
  });
});
