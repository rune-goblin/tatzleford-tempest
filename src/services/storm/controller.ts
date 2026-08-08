import { ELEMENTS, FLAG_ELEMENT_KEY, FLAG_SCOPE, FLAG_STATE_KEY, HOOKS, STATE_PATH } from '../../constants';
import { parseTempestState } from '../../data/TempestStateModel';
import { getAutoZoneCards, getDefaultCellSquares } from '../../settings';
import { cellKey, coarseGrid, paintedCells } from '../grid';
import type { SceneLike } from '../grid';
import type { Cell, Element, StateChanges, StormProposal, TempestSceneState } from '../../types';
import { nudgeElement, planAdvance } from './plan';
import { pick } from './rng';
import { catchZones, postZoneCards, type ZoneCatch } from './zone-damage';

/**
 * The only module that touches documents. Planners stay pure; the layer and the console read and
 * write scene state exclusively through these signatures.
 */

/** Validated committed state for a scene, defaulted when the flag is absent. */
export function readState(scene: Scene): TempestSceneState {
  return parseTempestState(scene.getFlag(FLAG_SCOPE, FLAG_STATE_KEY), getDefaultCellSquares());
}

/** One `scene.update()`; keys are dot paths relative to the state root. */
export async function writeState(scene: Scene, changes: StateChanges): Promise<void> {
  const update: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(changes)) update[`${STATE_PATH}.${path}`] = value;
  await scene.update(update);
}

/**
 * Runs the planners against committed state. Ephemeral and GM-client-only: nothing is written
 * until `commitAdvance`. Pass `only` to reroll a single element, leaving the others in place.
 */
export function proposeAdvance(scene: Scene, previous?: StormProposal, only?: Element): StormProposal {
  const state = readState(scene);
  return planAdvance(state.storm, painted(scene, state), previous, only);
}

/** Shifts one element of a proposal by one cell, for the console's 8-way nudge pad. */
export function nudgeProposal(proposal: StormProposal, element: Element, di: number, dj: number): StormProposal {
  return nudgeElement(proposal, element, di, dj);
}

/** What the ghost would sweep over if committed now. Rolls nothing and writes nothing. */
export function previewZones(scene: Scene, proposal: StormProposal): ZoneCatch[] {
  return catchZones(scene, readState(scene), proposal);
}

/**
 * Writes the proposal — the point at which the map changes for players — then resolves the zone
 * sweep against the cells each element newly occupies. Returns the zones it did *not* post,
 * because `autoZoneCards` is off and the GM will post them from the console instead.
 */
export async function commitAdvance(scene: Scene, proposal: StormProposal): Promise<ZoneCatch[]> {
  // Caught before the write, against the state the elements are leaving.
  const zones = catchZones(scene, readState(scene), proposal);
  const changes: StateChanges = { 'storm.seed': proposal.seed, 'storm.round': proposal.round };

  if (proposal.lightning) changes['storm.lightning.strikes'] = proposal.lightning.strikes;
  if (proposal.wind) {
    changes['storm.wind.pos'] = proposal.wind.pos;
    changes['storm.wind.trail'] = proposal.wind.trail;
    changes['storm.wind.heading'] = proposal.wind.heading;
  }
  if (proposal.water) {
    changes['storm.water.front'] = proposal.water.front;
    changes['storm.water.heading'] = proposal.water.heading;
  }

  // `destroyed` stays out of the write: the GM owns those toggles and a commit must not clobber one.
  await writeState(scene, changes);

  if (!getAutoZoneCards()) return zones;
  await postZoneCards(zones);
  return [];
}

/** Uniform pick over the painted cells, for the doc's random-sector roll. */
export function rollRandomCell(scene: Scene): string | null {
  const state = readState(scene);
  const cells = painted(scene, state);
  if (cells.length === 0) return null;
  // A GM convenience roll, not part of the replayable storm sequence — hence the ambient RNG.
  return cellKey(pick(Math.random, cells));
}

/**
 * `updateScene` fan-out. Diffs the state flag and calls `HOOKS.stateChanged` so the layer
 * redraws and the console store refreshes without either importing the other.
 */
export function onSceneUpdate(scene: Scene, changed: Record<string, unknown>): void {
  if (!touchesState(changed)) return;
  Hooks.callAll(HOOKS.stateChanged, scene, readState(scene));
}

/**
 * `updateActor` fan-out. A Tempest actor reaching 0 HP calls `HOOKS.elementDown`, which only
 * lights the console's indicator — the GM still flips the destroyed toggle by hand.
 */
export function onActorUpdate(actor: Actor, changed: Record<string, unknown>): void {
  const element = actor.getFlag(FLAG_SCOPE, FLAG_ELEMENT_KEY);
  if (typeof element !== 'string' || !(ELEMENTS as readonly string[]).includes(element)) return;

  const hp = changedHitPoints(changed);
  if (hp === null || hp > 0) return;

  Hooks.callAll(HOOKS.elementDown, element as Element, actor);
}

function painted(scene: Scene, state: TempestSceneState): Cell[] {
  return paintedCells(state.cells, coarseGrid(sceneRect(scene), state.cellSquares));
}

/** `Scene#width`/`height` are nullable and include padding; the prepared dimensions are neither. */
function sceneRect(scene: Scene): SceneLike {
  const { sceneWidth, sceneHeight, size } = scene.dimensions;
  return { width: sceneWidth, height: sceneHeight, grid: { size } };
}

/** The diff arrives expanded, and a deleted key arrives as its `-=` form. */
function touchesState(changed: Record<string, unknown>): boolean {
  const flags = changed.flags as Record<string, unknown> | undefined;
  if (!flags) return false;
  if (`-=${FLAG_SCOPE}` in flags) return true;

  const scoped = flags[FLAG_SCOPE] as Record<string, unknown> | undefined;
  if (!scoped) return false;
  return FLAG_STATE_KEY in scoped || `-=${FLAG_STATE_KEY}` in scoped;
}

function changedHitPoints(changed: Record<string, unknown>): number | null {
  const system = changed.system as { attributes?: { hp?: { value?: unknown } } } | undefined;
  const value = system?.attributes?.hp?.value;
  return typeof value === 'number' ? value : null;
}
