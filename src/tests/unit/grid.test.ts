import { describe, expect, it } from 'vitest';
import {
  allCells,
  cellCenter,
  cellDistance,
  cellKey,
  cellRect,
  cellSizePx,
  cellsBetween,
  cellsEqual,
  clampCell,
  coarseGrid,
  containsCell,
  gridDimensions,
  isPainted,
  paintedCells,
  parseCellKey,
  pointToCell,
  step,
} from '@/services/grid';
import type { CellState, CoarseGrid } from '@/types';

/** The Tatzlford scene: 7200×4800 px, 33 px squares, default 12-square cells. */
const tatzlford = coarseGrid({ width: 7200, height: 4800, grid: { size: 33 } });

/** An exactly-divisible lattice, to separate clipping behaviour from the general case. */
const even: CoarseGrid = { sceneWidth: 800, sceneHeight: 400, squarePx: 100, cellSquares: 2 };

describe('cellSizePx', () => {
  it('multiplies the fine square by the cell edge', () => {
    expect(cellSizePx(tatzlford)).toBe(396);
    expect(cellSizePx({ ...tatzlford, cellSquares: 6 })).toBe(198);
  });
});

describe('gridDimensions', () => {
  it('counts the partial edge column and row', () => {
    expect(gridDimensions(tatzlford)).toEqual({ columns: 19, rows: 13 });
  });

  it('counts no extra when the cell size divides the scene', () => {
    expect(gridDimensions(even)).toEqual({ columns: 4, rows: 2 });
  });

  it('tracks a different cellSquares', () => {
    expect(gridDimensions({ ...tatzlford, cellSquares: 6 })).toEqual({ columns: 37, rows: 25 });
  });
});

describe('pointToCell', () => {
  it('anchors the lattice at scene (0,0)', () => {
    expect(pointToCell({ x: 0, y: 0 }, tatzlford)).toEqual({ i: 0, j: 0 });
  });

  it('puts a boundary pixel in the following cell', () => {
    expect(pointToCell({ x: 395, y: 395 }, tatzlford)).toEqual({ i: 0, j: 0 });
    expect(pointToCell({ x: 396, y: 396 }, tatzlford)).toEqual({ i: 1, j: 1 });
  });

  it('reaches the partial edge cells', () => {
    expect(pointToCell({ x: 7128, y: 4752 }, tatzlford)).toEqual({ i: 18, j: 12 });
    expect(pointToCell({ x: 7199, y: 4799 }, tatzlford)).toEqual({ i: 18, j: 12 });
  });

  it('returns out-of-range indices for points off the map', () => {
    expect(pointToCell({ x: -1, y: -1 }, tatzlford)).toEqual({ i: -1, j: -1 });
    expect(containsCell(pointToCell({ x: -1, y: -1 }, tatzlford), tatzlford)).toBe(false);
  });
});

describe('containsCell', () => {
  it('accepts the partial corner cell', () => {
    expect(containsCell({ i: 18, j: 12 }, tatzlford)).toBe(true);
  });

  it('rejects indices past the lattice', () => {
    expect(containsCell({ i: 19, j: 0 }, tatzlford)).toBe(false);
    expect(containsCell({ i: 0, j: 13 }, tatzlford)).toBe(false);
    expect(containsCell({ i: -1, j: 0 }, tatzlford)).toBe(false);
  });
});

describe('clampCell', () => {
  it('pulls out-of-range indices onto the edge', () => {
    expect(clampCell({ i: -5, j: 99 }, tatzlford)).toEqual({ i: 0, j: 12 });
    expect(clampCell({ i: 40, j: -2 }, tatzlford)).toEqual({ i: 18, j: 0 });
  });
});

describe('cellRect', () => {
  it('gives interior cells the full cell size', () => {
    expect(cellRect({ i: 2, j: 3 }, tatzlford)).toEqual({ x: 792, y: 1188, width: 396, height: 396 });
  });

  it('clips the last column to the 72-px remainder', () => {
    expect(cellRect({ i: 18, j: 0 }, tatzlford)).toEqual({ x: 7128, y: 0, width: 72, height: 396 });
  });

  it('clips the last row to the 48-px remainder', () => {
    expect(cellRect({ i: 0, j: 12 }, tatzlford)).toEqual({ x: 0, y: 4752, width: 396, height: 48 });
  });

  it('clips the corner cell on both axes', () => {
    expect(cellRect({ i: 18, j: 12 }, tatzlford)).toEqual({ x: 7128, y: 4752, width: 72, height: 48 });
  });

  it('clips nothing when the cell size divides the scene', () => {
    expect(cellRect({ i: 3, j: 1 }, even)).toEqual({ x: 600, y: 200, width: 200, height: 200 });
  });

  it('collapses a cell entirely outside the scene rect', () => {
    expect(cellRect({ i: 19, j: 13 }, tatzlford)).toEqual({ x: 7524, y: 5148, width: 0, height: 0 });
  });
});

describe('cellCenter', () => {
  it('centres on the full rect for interior cells', () => {
    expect(cellCenter({ i: 1, j: 1 }, tatzlford)).toEqual({ x: 594, y: 594 });
  });

  it('centres on the clipped rect, keeping edge markers on the map', () => {
    expect(cellCenter({ i: 18, j: 12 }, tatzlford)).toEqual({ x: 7164, y: 4776 });
  });
});

describe('cell keys', () => {
  it('joins with a comma so expandObject cannot split them', () => {
    expect(cellKey({ i: 12, j: 7 })).toBe('12,7');
    expect(cellKey({ i: 12, j: 7 })).not.toContain('.');
  });

  it('round-trips', () => {
    expect(parseCellKey(cellKey({ i: 18, j: 12 }))).toEqual({ i: 18, j: 12 });
  });

  it('compares by value', () => {
    expect(cellsEqual({ i: 1, j: 2 }, { i: 1, j: 2 })).toBe(true);
    expect(cellsEqual({ i: 1, j: 2 }, { i: 2, j: 1 })).toBe(false);
  });
});

describe('allCells', () => {
  it('enumerates row-major including the partial edges', () => {
    const cells = allCells(tatzlford);
    expect(cells).toHaveLength(19 * 13);
    expect(cells[0]).toEqual({ i: 0, j: 0 });
    expect(cells[1]).toEqual({ i: 1, j: 0 });
    expect(cells.at(-1)).toEqual({ i: 18, j: 12 });
  });
});

describe('cellsBetween', () => {
  it('covers the inclusive block a drag spans', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 500, y: 500 }, tatzlford)).toEqual([
      { i: 0, j: 0 },
      { i: 1, j: 0 },
      { i: 0, j: 1 },
      { i: 1, j: 1 },
    ]);
  });

  it('handles a drag running up and to the left', () => {
    expect(cellsBetween({ x: 500, y: 500 }, { x: 0, y: 0 }, tatzlford)).toHaveLength(4);
  });

  it('clamps a drag that leaves the scene', () => {
    const cells = cellsBetween({ x: -900, y: -900 }, { x: 100, y: 100 }, tatzlford);
    expect(cells).toEqual([{ i: 0, j: 0 }]);
  });
});

describe('paintedCells', () => {
  const cells: Record<string, CellState> = { '0,0': 0, '12,7': 1, '18,12': 2 };

  it('parses every painted key', () => {
    expect(paintedCells(cells)).toEqual([
      { i: 0, j: 0 },
      { i: 12, j: 7 },
      { i: 18, j: 12 },
    ]);
  });

  it('drops keys that fall outside a smaller lattice', () => {
    expect(paintedCells(cells, { ...tatzlford, cellSquares: 24 })).toEqual([{ i: 0, j: 0 }]);
  });

  it('reports membership by key', () => {
    expect(isPainted({ i: 12, j: 7 }, cells)).toBe(true);
    expect(isPainted({ i: 7, j: 12 }, cells)).toBe(false);
  });
});

describe('step', () => {
  it('moves one cell along a heading', () => {
    expect(step({ i: 5, j: 5 }, 'n')).toEqual({ i: 5, j: 4 });
    expect(step({ i: 5, j: 5 }, 'se')).toEqual({ i: 6, j: 6 });
  });

  it('scales by distance', () => {
    expect(step({ i: 5, j: 5 }, 'w', 3)).toEqual({ i: 2, j: 5 });
  });
});

describe('cellDistance', () => {
  it('measures Chebyshev distance', () => {
    expect(cellDistance({ i: 0, j: 0 }, { i: 3, j: 1 })).toBe(3);
    expect(cellDistance({ i: 2, j: 2 }, { i: 2, j: 2 })).toBe(0);
  });
});
