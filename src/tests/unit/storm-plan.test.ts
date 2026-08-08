import { describe, expect, it } from 'vitest';
import { cellKey } from '@/services/grid';
import { nudgeElement, planAdvance } from '@/services/storm/plan';
import type { Cell, StormProposal, StormState } from '@/types';

const town: Cell[] = [];
for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) town.push({ i, j });

function storm(overrides: Partial<StormState> = {}): StormState {
  return {
    seed: 90210,
    round: 3,
    lightning: { destroyed: false, strikes: [{ i: 0, j: 0 }] },
    wind: { destroyed: false, pos: { i: 4, j: 2 }, trail: [{ i: 4, j: 2 }], heading: 'e' },
    water: {
      destroyed: false,
      front: [
        { i: 1, j: 1 },
        { i: 1, j: 2 },
        { i: 1, j: 3 },
      ],
      heading: 'e',
    },
    ...overrides,
  };
}

describe('planAdvance', () => {
  it('advances every element, the round, and the seed', () => {
    const proposal = planAdvance(storm(), town);

    expect(proposal.round).toBe(4);
    expect(proposal.seed).not.toBe(90210);
    expect(proposal.lightning?.strikes.length).toBe(2);
    expect(proposal.wind?.pos).not.toEqual({ i: 4, j: 2 });
    expect(proposal.water?.front.length).toBeGreaterThan(0);
  });

  it('replays identically from the same committed seed', () => {
    expect(planAdvance(storm(), town)).toEqual(planAdvance(storm(), town));
  });

  it('diverges once the committed seed moves on', () => {
    expect(planAdvance(storm(), town)).not.toEqual(planAdvance(storm({ seed: 90211 }), town));
  });

  it('skips a destroyed element', () => {
    const state = storm();
    state.wind.destroyed = true;
    const proposal = planAdvance(state, town);

    expect(proposal.wind).toBeNull();
    expect(proposal.lightning).not.toBeNull();
    expect(proposal.water).not.toBeNull();
  });

  it('rerolls one element and carries the others through untouched', () => {
    const first = planAdvance(storm(), town);
    const rerolled = planAdvance(storm(), town, first, 'lightning');

    expect(rerolled.wind).toBe(first.wind);
    expect(rerolled.water).toBe(first.water);
    expect(rerolled.round).toBe(first.round);
    expect(rerolled.seed).not.toBe(first.seed);
  });

  it('keeps rerolling to fresh outcomes', () => {
    let proposal = planAdvance(storm(), town);
    const strikes = new Set<string>();
    for (let n = 0; n < 20; n++) {
      proposal = planAdvance(storm(), town, proposal, 'lightning');
      strikes.add(cellKey(proposal.lightning?.strikes.at(-1) as Cell));
    }
    expect(strikes.size).toBeGreaterThan(1);
  });

  it('rerolls every element when no element is named', () => {
    const first = planAdvance(storm(), town);
    const again = planAdvance(storm(), town, first);

    expect(again.round).toBe(first.round);
    expect(again.seed).not.toBe(first.seed);
    expect(again).not.toEqual(first);
  });

  it('proposes without motion when nothing is painted', () => {
    const state = storm();
    const proposal = planAdvance(state, []);

    expect(proposal.round).toBe(4);
    expect(proposal.lightning).toEqual(state.lightning);
    expect(proposal.wind).toEqual(state.wind);
    expect(proposal.water).toEqual(state.water);
  });
});

describe('nudgeElement', () => {
  const proposal = planAdvance(storm(), town);

  it('shifts the newest strike only', () => {
    const before = proposal.lightning as NonNullable<StormProposal['lightning']>;
    const after = nudgeElement(proposal, 'lightning', 1, -1).lightning as NonNullable<StormProposal['lightning']>;

    expect(after.strikes.at(-1)).toEqual({
      i: (before.strikes.at(-1) as Cell).i + 1,
      j: (before.strikes.at(-1) as Cell).j - 1,
    });
    expect(after.strikes.slice(0, -1)).toEqual(before.strikes.slice(0, -1));
  });

  it('drags the vortex trail head along with the vortex', () => {
    const before = proposal.wind as NonNullable<StormProposal['wind']>;
    const after = nudgeElement(proposal, 'wind', 0, 1).wind as NonNullable<StormProposal['wind']>;

    expect(after.pos).toEqual({ i: (before.pos as Cell).i, j: (before.pos as Cell).j + 1 });
    expect(after.trail.at(-1)).toEqual(after.pos);
    expect(after.trail).toHaveLength(before.trail.length);
  });

  it('translates the whole flood wall, keeping it contiguous', () => {
    const before = proposal.water as NonNullable<StormProposal['water']>;
    const after = nudgeElement(proposal, 'water', -1, 0).water as NonNullable<StormProposal['water']>;

    expect(after.front).toEqual(before.front.map((cell) => ({ i: cell.i - 1, j: cell.j })));
  });

  it('leaves the other elements identical', () => {
    const nudged = nudgeElement(proposal, 'water', 1, 0);
    expect(nudged.lightning).toBe(proposal.lightning);
    expect(nudged.wind).toBe(proposal.wind);
    expect(nudged.seed).toBe(proposal.seed);
  });

  it('no-ops on a destroyed element', () => {
    const state = storm();
    state.water.destroyed = true;
    const withoutWater = planAdvance(state, town);
    expect(nudgeElement(withoutWater, 'water', 1, 1)).toBe(withoutWater);
  });
});
