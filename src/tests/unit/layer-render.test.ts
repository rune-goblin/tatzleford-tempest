import {
  boltPoints,
  cellPolyline,
  dashSegment,
  dashedRectSegments,
  fadeRamp,
  gridLineSegments,
  labelScale,
  landmarkDamage,
  pipOffsets,
  proposalCells,
  spiralPoints,
  stripNoteIndex,
} from '@/layer/render';
import { coarseGrid } from '@/services/grid';
import type { CoarseGrid, StormProposal } from '@/types';
import { describe, expect, it } from 'vitest';

/** The Tatzlford scene: 7200×4800 px, 33 px squares, 12-square cells — 19×13 coarse cells. */
const tatzlford = coarseGrid({ width: 7200, height: 4800, grid: { size: 33 } });
const even: CoarseGrid = { sceneWidth: 800, sceneHeight: 400, squarePx: 100, cellSquares: 2 };

describe('gridLineSegments', () => {
  it('closes the lattice with one more line than cells on each axis', () => {
    expect(gridLineSegments(even)).toHaveLength(4 + 1 + (2 + 1));
  });

  it('pins the far edges to the scene rect when the last cell is partial', () => {
    const segments = gridLineSegments(tatzlford);
    const verticals = segments.filter((s) => s.x1 === s.x2);
    const horizontals = segments.filter((s) => s.y1 === s.y2);
    expect(verticals).toHaveLength(20);
    expect(horizontals).toHaveLength(14);
    expect(verticals.at(-1)?.x1).toBe(7200);
    expect(horizontals.at(-1)?.y1).toBe(4800);
  });

  it('never draws past the scene rect', () => {
    for (const segment of gridLineSegments(tatzlford)) {
      expect(Math.max(segment.x1, segment.x2)).toBeLessThanOrEqual(7200);
      expect(Math.max(segment.y1, segment.y2)).toBeLessThanOrEqual(4800);
    }
  });
});

describe('fadeRamp', () => {
  it('is empty for no history', () => {
    expect(fadeRamp(0, 0.2, 1)).toEqual([]);
  });

  it('gives a lone entry full strength', () => {
    expect(fadeRamp(1, 0.2, 1)).toEqual([1]);
  });

  it('ramps from faintest first to full last', () => {
    expect(fadeRamp(3, 0, 1)).toEqual([0, 0.5, 1]);
  });
});

describe('cellPolyline', () => {
  it('walks the clipped cell centres in order', () => {
    expect(cellPolyline([{ i: 0, j: 0 }, { i: 1, j: 0 }], even)).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ]);
  });

  it('keeps a partial edge cell centre inside the scene', () => {
    const [center] = cellPolyline([{ i: 18, j: 0 }], tatzlford);
    expect(center.x).toBeLessThan(7200);
    expect(center.x).toBe(7128 + 72 / 2);
  });
});

describe('spiralPoints', () => {
  it('starts at the centre and ends on the radius', () => {
    const points = spiralPoints({ x: 100, y: 100 }, 50, 2, 40);
    expect(points).toHaveLength(41);
    expect(points[0]).toEqual({ x: 100, y: 100 });
    expect(Math.hypot(points[40].x - 100, points[40].y - 100)).toBeCloseTo(50);
  });
});

describe('boltPoints', () => {
  it('alternates sides and spans the given height', () => {
    const points = boltPoints({ x: 0, y: 0 }, 100, 20, 4);
    expect(points.map((p) => p.x)).toEqual([-10, 10, -10, 10, -10]);
    expect(points[0].y).toBe(-50);
    expect(points[4].y).toBe(50);
  });

  it('is deterministic', () => {
    expect(boltPoints({ x: 3, y: 7 }, 40, 12)).toEqual(boltPoints({ x: 3, y: 7 }, 40, 12));
  });
});

describe('dashSegment', () => {
  it('splits a line into dashes on the dash+gap stride', () => {
    const dashes = dashSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 10);
    expect(dashes).toHaveLength(5);
    expect(dashes[0]).toEqual({ x1: 0, y1: 0, x2: 10, y2: 0 });
    expect(dashes[4]).toEqual({ x1: 80, y1: 0, x2: 90, y2: 0 });
  });

  it('clips a trailing partial dash to the line end', () => {
    const dashes = dashSegment({ x: 0, y: 0 }, { x: 25, y: 0 }, 10, 10);
    expect(dashes.at(-1)).toEqual({ x1: 20, y1: 0, x2: 25, y2: 0 });
  });

  it('returns nothing for a zero-length line', () => {
    expect(dashSegment({ x: 5, y: 5 }, { x: 5, y: 5 }, 10, 10)).toEqual([]);
  });
});

describe('dashedRectSegments', () => {
  it('closes the perimeter back to the first corner', () => {
    const segments = dashedRectSegments({ x: 0, y: 0, width: 40, height: 40 }, 40, 0);
    expect(segments).toHaveLength(4);
    expect(segments[3]).toEqual({ x1: 0, y1: 40, x2: 0, y2: 0 });
  });
});

describe('proposalCells', () => {
  const proposal: StormProposal = {
    seed: 1,
    round: 2,
    lightning: { destroyed: false, strikes: [{ i: 1, j: 1 }, { i: 4, j: 2 }] },
    wind: { destroyed: false, pos: { i: 3, j: 3 }, trail: [{ i: 2, j: 3 }], heading: 'e' },
    water: { destroyed: false, front: [{ i: 5, j: 0 }, { i: 5, j: 1 }], heading: 's' },
  };

  it('ghosts only the newest lightning strike', () => {
    expect(proposalCells(proposal).lightning).toEqual([{ i: 4, j: 2 }]);
  });

  it('ghosts the vortex position, not its trail', () => {
    expect(proposalCells(proposal).wind).toEqual([{ i: 3, j: 3 }]);
  });

  it('ghosts the whole flood front', () => {
    expect(proposalCells(proposal).water).toHaveLength(2);
  });

  it('ghosts nothing for a destroyed element', () => {
    expect(proposalCells({ ...proposal, wind: null, water: null, lightning: null })).toEqual({
      lightning: [],
      wind: [],
      water: [],
    });
  });
});

describe('stripNoteIndex', () => {
  it('drops the map index prefix', () => {
    expect(stripNoteIndex('A5. Skunk River Bridge')).toBe('Skunk River Bridge');
    expect(stripNoteIndex('A11. Thrillseekers')).toBe('Thrillseekers');
  });

  it('leaves an unprefixed label alone', () => {
    expect(stripNoteIndex("Able's Inn")).toBe("Able's Inn");
  });
});

describe('landmarkDamage', () => {
  it('is safe until the first hit', () => {
    expect(landmarkDamage(0, 3)).toBe(0);
  });

  it('is damaged between the first hit and durability', () => {
    expect(landmarkDamage(1, 3)).toBe(1);
    expect(landmarkDamage(2, 3)).toBe(1);
  });

  it('is destroyed at or past durability', () => {
    expect(landmarkDamage(3, 3)).toBe(2);
    expect(landmarkDamage(9, 2)).toBe(2);
  });
});

describe('labelScale', () => {
  it('inverts the stage zoom so labels hold their screen size', () => {
    expect(labelScale(0.5)).toBe(2);
    expect(labelScale(1)).toBe(1);
    expect(labelScale(2)).toBe(0.5);
  });

  it('clamps both ends', () => {
    expect(labelScale(0.01)).toBe(5);
    expect(labelScale(10)).toBe(0.5);
  });

  it('falls back to 1 for a degenerate scale', () => {
    expect(labelScale(0)).toBe(1);
    expect(labelScale(Number.NaN)).toBe(1);
  });
});

describe('pipOffsets', () => {
  it('centres the row on zero', () => {
    expect(pipOffsets(3, 10)).toEqual([-10, 0, 10]);
    expect(pipOffsets(2, 10)).toEqual([-5, 5]);
    expect(pipOffsets(1, 10)).toEqual([0]);
  });

  it('is empty for a landmark with no durability', () => {
    expect(pipOffsets(0)).toEqual([]);
  });
});
