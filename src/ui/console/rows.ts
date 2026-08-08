import { CELL_STATES, LANDMARKS } from '../../constants';
import type { Cell, Element, StormProposal, StormState, TempestSceneState } from '../../types';

/**
 * What the console renders, derived from committed state and the current proposal. Pure — the
 * store above it owns every Foundry call, so vitest runs this under plain Node.
 */

export interface ElementRow {
  element: Element;
  destroyed: boolean;
  /** The Tempest actor is at 0 HP. Lights an indicator only — the GM still flips `destroyed`. */
  down: boolean;
  position: Cell | null;
  proposed: Cell | null;
}

export interface LandmarkRow {
  id: string;
  note: string;
  hits: number;
  durability: number;
}

export interface CellCounts {
  painted: number;
  damaged: number;
  destroyed: number;
}

/** Where an element reads as standing right now: newest strike, the vortex, the flood's lead cell. */
export function positionOf(storm: StormState | null, element: Element): Cell | null {
  if (!storm) return null;
  if (element === 'lightning') return storm.lightning.strikes.at(-1) ?? null;
  if (element === 'wind') return storm.wind.pos;
  return storm.water.front[0] ?? null;
}

export function proposedPositionOf(proposal: StormProposal | null, element: Element): Cell | null {
  if (!proposal) return null;
  if (element === 'lightning') return proposal.lightning?.strikes.at(-1) ?? null;
  if (element === 'wind') return proposal.wind?.pos ?? null;
  return proposal.water?.front[0] ?? null;
}

export function countCells(state: TempestSceneState | null): CellCounts {
  const values = Object.values(state?.cells ?? {});
  return {
    painted: values.length,
    damaged: values.filter((value) => value === CELL_STATES.damaged).length,
    destroyed: values.filter((value) => value === CELL_STATES.destroyed).length,
  };
}

/** The tracker always shows all eleven landmarks; stored hits overlay the seeded durabilities. */
export function landmarkRows(state: TempestSceneState | null): LandmarkRow[] {
  return LANDMARKS.map((definition) => {
    const stored = state?.landmarks?.[definition.id];
    return {
      id: definition.id,
      note: definition.note,
      hits: stored?.hits ?? 0,
      durability: stored?.durability ?? definition.durability,
    };
  });
}
