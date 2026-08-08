import { MODULE_ID, ROUTINE_DIE, ZONE_EFFECTS } from '../../constants';
import { cellRect, parseCellKey } from '../grid';
import { cellTemplateData, placeTemplate, type CellScale } from '../templates';
import type { CellKey, Element } from '../../types';
import { readState, rollSector, sceneGrid, setRolledCell } from './controller';
import { planRoutine, type RoutinePlan } from './routine';

/**
 * The hazard's whole turn behind one button: 1d3 for the anchor, the destroyed short circuit, a
 * random sector, the template, and one card. It rolls and draws; the GM still picks the target,
 * rolls the save from the card's links, and applies every point of damage.
 */

export interface HazardTurn extends RoutinePlan {
  roll: number;
  /** `null` when the anchor faltered — nothing is rolled and nothing is placed. */
  cell: CellKey | null;
}

export async function runHazardTurn(scene: Scene): Promise<HazardTurn | null> {
  if (!game.user.isGM) {
    ui.notifications.warn(localize('notifications.gmOnly'));
    return null;
  }

  const roll = await new Roll(ROUTINE_DIE).evaluate();
  const total = roll.total ?? 1;
  const state = readState(scene);
  const plan = planRoutine(state.storm, total);
  const rolled = await roll.render();

  if (plan.destroyed) {
    // Last round's highlight would otherwise read as this round's sector.
    await setRolledCell(scene, null);
    await postCard(plan.element, roll, faltersLines(plan.element, rolled));
    ui.notifications.info(format('notifications.hazardFaltered', { anchor: anchor(plan.element) }));
    return { ...plan, roll: total, cell: null };
  }

  const cell = await rollSector(scene);
  if (cell === null) {
    ui.notifications.warn(localize('notifications.noPaintedCells'));
    return null;
  }

  const rect = cellRect(parseCellKey(cell), sceneGrid(scene, state));
  await placeTemplate(scene, cellTemplateData(plan.template, rect, cellScale(scene)));
  await postCard(plan.element, roll, routineLines(plan.element, cell, rolled));
  ui.notifications.info(format('notifications.hazardTurn', { routine: routine(plan.element), cell }));

  return { ...plan, roll: total, cell };
}

/** Feet per pixel and the fine square, both read from the scene rather than assumed. */
function cellScale(scene: Scene): CellScale {
  const { size, distance } = scene.dimensions;
  return { feetPerPixel: distance / size, squarePx: size };
}

function routineLines(element: Element, cell: CellKey, rolled: string): string[] {
  const effect = ZONE_EFFECTS[element];
  return [
    `<p><strong>${routine(element)}</strong> — ${anchor(element)}</p>`,
    rolled,
    `<p><strong>${localize('hazard.card.sector')}</strong> ${format('console.elements.position', { cell })}</p>`,
    `<p><strong>${localize(`hazard.effect.${element}.areaLabel`)}</strong> ${localize(
      `hazard.effect.${element}.area`,
    )}</p>`,
    `<p><strong>${localize('zone.card.save')}</strong> ${effect.check}</p>`,
    `<p><strong>${localize('zone.card.damage')}</strong> ${effect.damage}</p>`,
    `<p>${localize('zone.card.basicSave')}</p>`,
    '<hr />',
    `<p><strong>${localize('zone.card.failure')}</strong> ${localize(`zone.effect.${element}.failure`)}</p>`,
    `<p><strong>${localize('zone.card.critFailure')}</strong> ${format(`zone.effect.${element}.critFailure`, {
      persistent: effect.persistent,
    })}</p>`,
    `<p class="tempest-zone-note">${localize('hazard.card.scaled')}</p>`,
    `<p class="tempest-zone-note">${localize('hazard.card.collateral')}</p>`,
    `<p class="tempest-zone-note">${localize('zone.card.riders')}</p>`,
  ];
}

function faltersLines(element: Element, rolled: string): string[] {
  return [
    `<p><strong>${anchor(element)}</strong></p>`,
    rolled,
    `<p>${format('hazard.card.falters', { anchor: anchor(element), routine: routine(element) })}</p>`,
    `<p><em>${localize('hazard.card.noReroll')}</em></p>`,
  ];
}

/** The card carries its own rendered roll; `rolls` rides along so Dice So Nice still animates it. */
async function postCard(element: Element, roll: Roll, lines: string[]): Promise<void> {
  const data = {
    content: `<div class="tatzleford-tempest zone-card">${lines.join('')}</div>`,
    rolls: [roll],
    flavor: localize('hazard.card.flavor'),
    whisper: ChatMessage.getWhisperRecipients('GM').map((user) => user.id),
    speaker: { alias: localize('zone.card.speaker') },
    flags: { [MODULE_ID]: { hazardTurn: element } },
  };
  // `rolls` blows the inferred create() signature past tsc's instantiation depth.
  await ChatMessage.create(data as Parameters<typeof ChatMessage.create>[0]);
}

function anchor(element: Element): string {
  return localize(`element.${element}.anchor`);
}

function routine(element: Element): string {
  return localize(`element.${element}.routine`);
}

function localize(key: string): string {
  return game.i18n.localize(`${MODULE_ID}.${key}`);
}

function format(key: string, data: Record<string, string | number>): string {
  return game.i18n.format(`${MODULE_ID}.${key}`, data);
}
