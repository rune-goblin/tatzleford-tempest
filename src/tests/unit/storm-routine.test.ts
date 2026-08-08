import { describe, expect, it } from 'vitest';
import { anchorForRoll, planRoutine } from '@/services/storm/routine';
import type { StormState } from '@/types';

function storm(destroyed: Partial<Record<'lightning' | 'wind' | 'water', boolean>> = {}): StormState {
  return {
    seed: 1,
    round: 1,
    rolledCell: null,
    lightning: { destroyed: destroyed.lightning ?? false, strikes: [] },
    wind: { destroyed: destroyed.wind ?? false, pos: null, trail: [], heading: 'n' },
    water: { destroyed: destroyed.water ?? false, front: [], heading: 'n' },
  };
}

describe('anchorForRoll', () => {
  it('follows the design doc table: 1 wind, 2 lightning, 3 water', () => {
    expect(anchorForRoll(1)).toBe('wind');
    expect(anchorForRoll(2)).toBe('lightning');
    expect(anchorForRoll(3)).toBe('water');
  });

  it('clamps a total outside 1d3 rather than returning undefined', () => {
    expect(anchorForRoll(0)).toBe('wind');
    expect(anchorForRoll(9)).toBe('water');
  });
});

describe('planRoutine', () => {
  it('pairs each anchor with its routine template', () => {
    expect(planRoutine(storm(), 1).template).toBe('thunderclap');
    expect(planRoutine(storm(), 2).template).toBe('queensLightning');
    expect(planRoutine(storm(), 3).template).toBe('rendingDeluge');
  });

  it('reports the rolled anchor as destroyed, never substituting another', () => {
    const plan = planRoutine(storm({ wind: true }), 1);
    expect(plan).toEqual({ element: 'wind', template: 'thunderclap', destroyed: true });
  });

  it('is unaffected by the other anchors being destroyed', () => {
    expect(planRoutine(storm({ wind: true, water: true }), 2).destroyed).toBe(false);
  });
});
