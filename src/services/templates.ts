import { MODULE_ID, TEMPLATES } from '../constants';
import type { Point } from '../types';

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
  const data = templateData(kind, origin, aim) as unknown as Record<string, unknown>;
  await scene.createEmbeddedDocuments('MeasuredTemplate', [data]);
  ui.notifications.info(game.i18n.localize(`${MODULE_ID}.notifications.templatePlaced`));
}
