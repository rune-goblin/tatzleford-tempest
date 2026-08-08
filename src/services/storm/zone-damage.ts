import type { ActorPF2e } from 'foundry-pf2e';
import {
  ELEMENTS,
  FLAG_ELEMENT_KEY,
  FLAG_SCOPE,
  MODULE_ID,
  ZONE_EFFECTS,
  ZONE_ROLL_OPTIONS,
  ZONE_SAVE_DC,
} from '../../constants';
import { getZoneHiddenTokens } from '../../settings';
import { cellKey, coarseGrid } from '../grid';
import type { Cell, CoarseGrid, Element, StormProposal, TempestSceneState } from '../../types';
import {
  degreeKeys,
  isStormAnchor,
  newlyOccupied,
  tokensInCells,
  type TokenFootprint,
} from './zones';

/**
 * The zone sweep on the Foundry side: which tokens a committed advance runs over, their saves, and
 * the GM-whispered card that reports them. The module rolls and posts; the GM applies. It writes no
 * hit points, applies no conditions, and moves nothing.
 */

export interface ZoneCatch {
  element: Element;
  round: number;
  sceneId: string;
  cells: Cell[];
  tokens: { id: string; name: string }[];
}

interface SaveResult {
  name: string;
  total: number | null;
  /** PF2e's degree index: 0 critical failure … 3 critical success. `null` when nothing was rolled. */
  degree: number | null;
}

/** What each element would sweep over, ghost or committed — the console previews with it. */
export function catchZones(scene: Scene, state: TempestSceneState, proposal: StormProposal): ZoneCatch[] {
  const grid = coarseGrid(sceneRect(scene), state.cellSquares);
  const tokens = footprints(scene);

  return ELEMENTS.map((element) => {
    const cells = newlyOccupied(state.storm, proposal, element);
    return {
      element,
      round: proposal.round,
      sceneId: scene.id ?? '',
      cells,
      tokens: caught(tokens, cells, grid),
    };
  }).filter((zone) => zone.tokens.length > 0);
}

export function catchCounts(zones: ZoneCatch[]): Record<Element, number> {
  const counts = { lightning: 0, wind: 0, water: 0 };
  for (const zone of zones) counts[zone.element] = zone.tokens.length;
  return counts;
}

/** Rolls every caught creature's save and whispers the GM one card per element. */
export async function postZoneCards(zones: ZoneCatch[]): Promise<void> {
  const target = targetName();
  for (const zone of zones) {
    const results = await rollSaves(zone);
    await ChatMessage.create({
      content: cardContent(zone, results, target),
      whisper: ChatMessage.getWhisperRecipients('GM').map((user) => user.id),
      speaker: { alias: localize('zone.card.speaker') },
      flags: { [MODULE_ID]: { zone: zone.element, round: zone.round } },
    });
  }
}

/**
 * One save per caught creature, the way an inline `@Check` rolls it
 * (`_pf2e-source/src/scripts/ui/inline-roll-links.ts` → `Statistic#roll`). `createMessage: false`
 * keeps the individual rolls off the log: the zone card below reports them together.
 */
async function rollSaves(zone: ZoneCatch): Promise<SaveResult[]> {
  const effect = ZONE_EFFECTS[zone.element];
  const scene = game.scenes?.get(zone.sceneId);
  const results: SaveResult[] = [];

  for (const entry of zone.tokens) {
    const token = scene?.tokens.get(entry.id);
    const actor = token?.actor as ActorPF2e | null | undefined;
    const statistic = actor?.getStatistic(effect.save);
    const roll = await statistic?.roll({
      dc: { value: ZONE_SAVE_DC, label: localize(`element.${zone.element}.routine`) },
      extraRollOptions: [...ZONE_ROLL_OPTIONS],
      identifier: `${MODULE_ID}.zone.${zone.element}`,
      skipDialog: true,
      createMessage: false,
    });

    results.push({ name: entry.name, total: roll?.total ?? null, degree: roll?.degreeOfSuccess ?? null });
  }
  return results;
}

function caught(tokens: TokenFootprint[], cells: Cell[], grid: CoarseGrid): { id: string; name: string }[] {
  return tokensInCells(tokens, cells, grid).map((token) => ({ id: token.id, name: token.name }));
}

function footprints(scene: Scene): TokenFootprint[] {
  const includeHidden = getZoneHiddenTokens();
  const found: TokenFootprint[] = [];

  for (const token of scene.tokens) {
    if (token.hidden && !includeHidden) continue;
    if (isStormAnchor(token.actor?.getFlag(FLAG_SCOPE, FLAG_ELEMENT_KEY))) continue;
    const size = token.getSize();
    found.push({
      id: token.id ?? '',
      name: token.name,
      rect: { x: token.x, y: token.y, width: size.width, height: size.height },
    });
  }
  return found;
}

/**
 * The module never picks the round's target — the GM does. A target, if one happens to be set,
 * only labels the card.
 */
function targetName(): string | null {
  const [target] = game.user.targets;
  return target?.name ?? null;
}

function cardContent(zone: ZoneCatch, results: SaveResult[], target: string | null): string {
  const effect = ZONE_EFFECTS[zone.element];
  const lines = [
    `<p><strong>${localize(`element.${zone.element}.routine`)}</strong> — ${format('zone.card.subtitle', {
      element: localize(`element.${zone.element}.name`),
      round: zone.round,
    })}</p>`,
    `<p><strong>${localize('zone.card.save')}</strong> ${effect.check}</p>`,
    `<p><strong>${localize('zone.card.damage')}</strong> ${effect.damage}</p>`,
    `<p>${localize('zone.card.basicSave')}</p>`,
    '<hr />',
    `<ul>${results.map(resultLine).join('')}</ul>`,
  ];

  if (target) lines.push(`<p><strong>${localize('zone.card.target')}</strong> ${escape(target)}</p>`);

  lines.push(
    '<hr />',
    `<p><strong>${localize('zone.card.failure')}</strong> ${localize(`zone.effect.${zone.element}.failure`)}</p>`,
    `<p><strong>${localize('zone.card.critFailure')}</strong> ${format(
      `zone.effect.${zone.element}.critFailure`,
      { persistent: effect.persistent },
    )}</p>`,
    `<p class="tempest-zone-note">${format('zone.card.cells', { cells: zone.cells.map(cellKey).join(', ') })}</p>`,
    `<p class="tempest-zone-note">${localize('zone.card.riders')}</p>`,
  );

  return `<div class="tatzleford-tempest zone-card">${lines.join('')}</div>`;
}

function resultLine(result: SaveResult): string {
  const keys = degreeKeys(result.degree);
  const name = escape(result.name);
  if (!keys || result.total === null) return `<li>${format('zone.card.unrolled', { name })}</li>`;

  return `<li>${format('zone.card.result', {
    name,
    total: result.total,
    degree: localize(`zone.degree.${keys.degree}`),
    damage: localize(`zone.multiplier.${keys.multiplier}`),
  })}</li>`;
}

/** Token names reach the card as HTML, and a GM may well have named something with a bracket. */
function escape(value: string): string {
  return foundry.utils.escapeHTML(value);
}

function localize(key: string): string {
  return game.i18n.localize(`${MODULE_ID}.${key}`);
}

function format(key: string, data: Record<string, string | number>): string {
  return game.i18n.format(`${MODULE_ID}.${key}`, data);
}

/** `Scene#width`/`height` include padding; the prepared dimensions are the bare map. */
function sceneRect(scene: Scene): { width: number; height: number; grid: { size: number } } {
  const { sceneWidth, sceneHeight, size } = scene.dimensions;
  return { width: sceneWidth, height: sceneHeight, grid: { size } };
}
