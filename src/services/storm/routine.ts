import { ROUTINE_ANCHORS, ROUTINE_TEMPLATES } from '../../constants';
import type { TemplateKind } from '../templates';
import type { Element, StormState } from '../../types';

/**
 * Section 3's routine table, as pure arithmetic — no `foundry.*`, so vitest runs it under plain
 * Node. `hazard-turn.ts` rolls the die and touches the documents.
 */

export interface RoutinePlan {
  element: Element;
  template: TemplateKind;
  /** The anchor is gone: the storm takes no action this round, and the doc forbids a reroll. */
  destroyed: boolean;
}

export function anchorForRoll(total: number): Element {
  const index = Math.min(Math.max(Math.trunc(total), 1), ROUTINE_ANCHORS.length) - 1;
  return ROUTINE_ANCHORS[index];
}

export function planRoutine(storm: StormState, total: number): RoutinePlan {
  const element = anchorForRoll(total);
  return { element, template: ROUTINE_TEMPLATES[element], destroyed: storm[element].destroyed };
}
