import { MODULE_ID, TEMPLATES } from '../constants';
import type { Point, Rect } from '../types';

/**
 * PF2e measured templates for the hazard's three routines. Placed, never resolved: no saves, no
 * damage, no conditions — the GM runs those through PF2e's normal cards.
 */

export type TemplateKind = keyof typeof TEMPLATES;

/** `origin` picked, waiting for the cone's aim click. */
export type TemplatePhase = 'origin' | 'aim';

export interface ArmedTemplate {
  kind: TemplateKind;
  phase: TemplatePhase;
}

export interface TemplateData {
  t: (typeof TEMPLATES)[TemplateKind]['t'];
  x: number;
  y: number;
  distance: number;
  direction: number;
  angle?: number;
  flags: { pf2e: { areaShape: string } };
}

/** Only the cone needs a second click; every other shape is radial. */
export function needsAim(kind: TemplateKind): boolean {
  return TEMPLATES[kind].t === 'cone';
}

/** Degrees clockwise from east — the convention `MeasuredTemplate#direction` uses. */
export function aimDirection(origin: Point, aim: Point): number {
  const degrees = (Math.atan2(aim.y - origin.y, aim.x - origin.x) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

export function templateData(kind: TemplateKind, origin: Point, aim?: Point): TemplateData {
  const spec = TEMPLATES[kind];
  const data: TemplateData = {
    t: spec.t,
    x: origin.x,
    y: origin.y,
    distance: spec.distance,
    direction: aim ? aimDirection(origin, aim) : 0,
    flags: { pf2e: { areaShape: spec.areaShape } },
  };
  if ('angle' in spec) data.angle = spec.angle;
  return data;
}

/** Pixel-to-distance conversion for the scene a cell belongs to. */
export interface CellScale {
  /** `scene.grid.distance / scene.dimensions.size` — feet per pixel, never assumed to be 5/33. */
  feetPerPixel: number;
  /** Fine grid square in pixels. Template anchors snap to its lattice, as PF2e bursts expect. */
  squarePx: number;
}

/**
 * A template scaled to fill one district cell rather than to its printed area — the deliberate
 * deviation the hazard turn makes so the whole struck district is visible. Everything derives from
 * the cell's own clipped rect, so an edge cell gets a smaller template rather than one hanging off
 * the map. The card the hazard turn posts still quotes the rule's real area.
 */
export function cellTemplateData(kind: TemplateKind, rect: Rect, scale: CellScale): TemplateData {
  const spec = TEMPLATES[kind];
  const feet = (px: number): number => Math.round(px * scale.feetPerPixel);
  const snap = (value: number): number => Math.round(value / scale.squarePx) * scale.squarePx;

  if (spec.t === 'cone') {
    // Cones open 45° either side, so one that just reaches the far edge is already wider than the
    // district there. Crossing the longer axis leaves the least of a clipped strip uncovered.
    const across = rect.width >= rect.height;
    return {
      t: spec.t,
      x: across ? rect.x : snap(rect.x + rect.width / 2),
      y: across ? snap(rect.y + rect.height / 2) : rect.y,
      distance: feet(across ? rect.width : rect.height),
      direction: across ? 0 : 90,
      angle: spec.angle,
      flags: { pf2e: { areaShape: spec.areaShape } },
    };
  }

  return {
    t: spec.t,
    x: snap(rect.x + rect.width / 2),
    y: snap(rect.y + rect.height / 2),
    distance: feet(Math.max(rect.width, rect.height) / 2),
    direction: 0,
    flags: { pf2e: { areaShape: spec.areaShape } },
  };
}

export async function placeTemplate(scene: Scene, data: TemplateData): Promise<void> {
  await scene.createEmbeddedDocuments('MeasuredTemplate', [data as unknown as Record<string, unknown>]);
}

let session: { dispose: () => void } | null = null;

/**
 * Arms a one-shot click-to-place. `onChange` reports the phase so the console can prompt for the
 * cone's aim click, and receives `null` once the template lands or the GM cancels.
 */
export function armTemplate(kind: TemplateKind, onChange: (armed: ArmedTemplate | null) => void): void {
  cancelTemplate();
  if (!canvas.scene) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.notifications.noScene`));
    return;
  }

  let phase: TemplatePhase = 'origin';
  let origin: Point | null = null;

  const finish = (cancelled: boolean): void => {
    dispose();
    if (cancelled) ui.notifications.info(game.i18n.localize(`${MODULE_ID}.notifications.templateCancelled`));
    onChange(null);
  };

  const onPointerDown = (event: PointerEvent): void => {
    // The listener is on `document` in the capture phase, so it also sees clicks inside the
    // console window; only the board should place a template.
    if ((event.target as HTMLElement | null)?.id !== 'board') return;
    if (event.button === 2) {
      finish(true);
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const point = snapPoint(pointerPoint());
    if (phase === 'origin') {
      origin = point;
      if (needsAim(kind)) {
        phase = 'aim';
        onChange({ kind, phase });
        return;
      }
    }
    void place(kind, origin ?? point, phase === 'aim' ? point : undefined);
    dispose();
    onChange(null);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    finish(true);
  };

  const swallowContextMenu = (event: MouseEvent): void => {
    if ((event.target as HTMLElement | null)?.id === 'board') event.preventDefault();
  };

  const dispose = (): void => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('contextmenu', swallowContextMenu, true);
    session = null;
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('contextmenu', swallowContextMenu, true);
  session = { dispose };
  onChange({ kind, phase });
}

export function cancelTemplate(): void {
  session?.dispose();
}

function pointerPoint(): Point {
  const { x, y } = canvas.mousePosition;
  return { x, y };
}

/** Bursts and cones emanate from a grid intersection, so snap the click to the nearest vertex. */
function snapPoint(point: Point): Point {
  return canvas.grid.getSnappedPoint(point, { mode: CONST.GRID_SNAPPING_MODES.VERTEX });
}

async function place(kind: TemplateKind, origin: Point, aim?: Point): Promise<void> {
  const scene = canvas.scene;
  if (!scene) return;
  await placeTemplate(scene, templateData(kind, origin, aim));
  ui.notifications.info(game.i18n.localize(`${MODULE_ID}.notifications.templatePlaced`));
}
