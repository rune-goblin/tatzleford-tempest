import { DEGREE_KEYS, DEGREE_MULTIPLIERS, MULTIPLIER_KEYS } from '../../constants';
import { cellKey, cellRect } from '../grid';
import type {
  Cell,
  CoarseGrid,
  Element,
  LightningState,
  Rect,
  WaterState,
  WindState,
} from '../../types';

/**
 * Which cells each element stands in, and which tokens that sweeps over. Pure — the Foundry side
 * lives in `zone-damage.ts`; nothing here touches a document.
 */

/** Both committed `StormState` and an ephemeral `StormProposal` satisfy this structurally. */
export interface ElementCells {
  lightning: LightningState | null;
  wind: WindState | null;
  water: WaterState | null;
}

/** A token reduced to what the sweep cares about: its name and its footprint in scene pixels. */
export interface TokenFootprint {
  id: string;
  name: string;
  rect: Rect;
}

/** The strike, the vortex's cell, the whole flood wall. Trails and older strikes are history. */
export function elementCells(source: ElementCells, element: Element): Cell[] {
  if (element === 'lightning') {
    const strike = source.lightning?.strikes.at(-1);
    return strike ? [strike] : [];
  }
  if (element === 'wind') return source.wind?.pos ? [source.wind.pos] : [];
  return source.water?.front ?? [];
}

/** The zone hits what it sweeps over: ground the element already held is not swept again. */
export function newlyOccupied(before: ElementCells, after: ElementCells, element: Element): Cell[] {
  const held = new Set(elementCells(before, element).map(cellKey));
  return elementCells(after, element).filter((cell) => !held.has(cellKey(cell)));
}

/** Shared area, not shared edges: a token flush against a cell's boundary is outside it. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * A Large token is 2×2 fine squares — 66 px inside a 396 px cell — so it can straddle a cell
 * boundary with its centre outside the zone. The whole footprint is tested, never the centre.
 */
export function tokensInCells(tokens: TokenFootprint[], cells: Cell[], grid: CoarseGrid): TokenFootprint[] {
  if (cells.length === 0) return [];
  const rects = cells.map((cell) => cellRect(cell, grid));
  return tokens.filter((token) => rects.some((rect) => rectsOverlap(token.rect, rect)));
}

/** The storm never damages its own anchors: any actor carrying the element flag is skipped. */
export function isStormAnchor(elementFlag: unknown): boolean {
  return typeof elementFlag === 'string' && elementFlag.length > 0;
}

/** Basic save: crit success none, success half, failure full, crit failure double. */
export function damageMultiplier(degree: number | null): number | null {
  return degree === null ? null : (DEGREE_MULTIPLIERS[degree] ?? null);
}

/** i18n suffixes for a rolled degree; `null` where no save was rolled. */
export function degreeKeys(degree: number | null): { degree: string; multiplier: string } | null {
  if (degree === null) return null;
  const key = DEGREE_KEYS[degree];
  const multiplier = MULTIPLIER_KEYS[degree];
  return key && multiplier ? { degree: key, multiplier } : null;
}
