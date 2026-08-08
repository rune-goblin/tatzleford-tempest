import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '@/constants';
import { countCells, landmarkRows, positionOf, proposedPositionOf } from '@/ui/console/rows';
import type { StormProposal, StormState, TempestSceneState } from '@/types';

const storm: StormState = {
  seed: 1,
  round: 3,
  rolledCell: null,
  lightning: { destroyed: false, strikes: [{ i: 1, j: 1 }, { i: 4, j: 2 }] },
  wind: { destroyed: false, pos: { i: 7, j: 3 }, trail: [], heading: 'e' },
  water: { destroyed: false, front: [{ i: 2, j: 5 }, { i: 2, j: 6 }], heading: 'n' },
};

const state: TempestSceneState = {
  cellSquares: 12,
  cells: { '0,0': 0, '1,0': 1, '2,0': 2, '3,0': 2 },
  landmarks: { 'skunk-river-bridge': { hits: 1, durability: 2 } },
  storm,
};

describe('positionOf', () => {
  it('reads the newest lightning strike', () => {
    expect(positionOf(storm, 'lightning')).toEqual({ i: 4, j: 2 });
  });

  it('reads the vortex position and the flood front’s lead cell', () => {
    expect(positionOf(storm, 'wind')).toEqual({ i: 7, j: 3 });
    expect(positionOf(storm, 'water')).toEqual({ i: 2, j: 5 });
  });

  it('has no position before the storm has moved', () => {
    const fresh: StormState = {
      ...storm,
      lightning: { destroyed: false, strikes: [] },
      wind: { destroyed: false, pos: null, trail: [], heading: 'e' },
      water: { destroyed: false, front: [], heading: 'e' },
    };
    expect(positionOf(fresh, 'lightning')).toBeNull();
    expect(positionOf(fresh, 'wind')).toBeNull();
    expect(positionOf(fresh, 'water')).toBeNull();
    expect(positionOf(null, 'wind')).toBeNull();
  });
});

describe('proposedPositionOf', () => {
  const proposal: StormProposal = {
    seed: 2,
    round: 4,
    lightning: { destroyed: false, strikes: [{ i: 9, j: 9 }] },
    wind: null,
    water: null,
  };

  it('reads the proposed cell, and nothing for elements that did not move', () => {
    expect(proposedPositionOf(proposal, 'lightning')).toEqual({ i: 9, j: 9 });
    expect(proposedPositionOf(proposal, 'wind')).toBeNull();
    expect(proposedPositionOf(proposal, 'water')).toBeNull();
    expect(proposedPositionOf(null, 'lightning')).toBeNull();
  });
});

describe('countCells', () => {
  it('counts painted cells and the damaged and destroyed subsets', () => {
    expect(countCells(state)).toEqual({ painted: 4, damaged: 1, destroyed: 2 });
  });

  it('reports zeroes for an unpainted scene', () => {
    expect(countCells(null)).toEqual({ painted: 0, damaged: 0, destroyed: 0 });
  });
});

describe('landmarkRows', () => {
  it('lists every landmark, seeding durability from the constant', () => {
    const rows = landmarkRows(null);
    expect(rows).toHaveLength(LANDMARKS.length);
    expect(rows.every((row) => row.hits === 0)).toBe(true);
    expect(rows.find((row) => row.id === 'skunk-river-bridge')?.durability).toBe(2);
  });

  it('overlays stored hits on the seeded table', () => {
    const bridge = landmarkRows(state).find((row) => row.id === 'skunk-river-bridge');
    expect(bridge).toMatchObject({ hits: 1, durability: 2 });
  });
});
