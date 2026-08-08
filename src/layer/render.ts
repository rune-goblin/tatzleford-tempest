import {
  CELL_ALPHAS,
  CELL_COLORS,
  CELL_STATES,
  ELEMENT_COLORS,
  GHOST_ALPHA,
  GRID_LINE_ALPHA,
  GRID_LINE_COLOR,
} from '../constants';
import { cellCenter, cellRect, cellSizePx, containsCell, gridDimensions, parseCellKey } from '../services/grid';
import type { Cell, CellKey, CellState, CoarseGrid, Element, Point, Rect, StormProposal, StormState } from '../types';

/**
 * Render geometry for the Tempest overlay. The exported geometry functions are pure arithmetic —
 * they take no PIXI object and run under plain Node — so `src/tests/unit/layer-render.test.ts`
 * can cover the shapes without a canvas. The `draw*` functions below turn them into Graphics
 * calls and hold no state of their own.
 */

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Every coarse lattice line, verticals then horizontals, with the far edges pinned to the scene rect. */
export function gridLineSegments(grid: CoarseGrid): Segment[] {
  const size = cellSizePx(grid);
  const { columns, rows } = gridDimensions(grid);
  const segments: Segment[] = [];
  for (let i = 0; i <= columns; i++) {
    const x = Math.min(i * size, grid.sceneWidth);
    segments.push({ x1: x, y1: 0, x2: x, y2: grid.sceneHeight });
  }
  for (let j = 0; j <= rows; j++) {
    const y = Math.min(j * size, grid.sceneHeight);
    segments.push({ x1: 0, y1: y, x2: grid.sceneWidth, y2: y });
  }
  return segments;
}

/** An alpha ramp for a newest-last history: index 0 faintest, the final entry at full strength. */
export function fadeRamp(count: number, min: number, max: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [max];
  return Array.from({ length: count }, (_, k) => min + ((max - min) * k) / (count - 1));
}

/** Cell centres in order — the polyline a trail or a flood front is stroked along. */
export function cellPolyline(cells: Cell[], grid: CoarseGrid): Point[] {
  return cells.map((cell) => cellCenter(cell, grid));
}

/** An Archimedean spiral from the centre outwards, for the vortex mark. */
export function spiralPoints(center: Point, radius: number, turns = 2.5, steps = 48): Point[] {
  const points: Point[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const angle = t * turns * Math.PI * 2;
    const r = t * radius;
    points.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
  }
  return points;
}

/** A zigzag bolt centred on a point. Deterministic: the same cell always draws the same mark. */
export function boltPoints(center: Point, height: number, width: number, zigs = 4): Point[] {
  const points: Point[] = [];
  for (let k = 0; k <= zigs; k++) {
    const t = k / zigs;
    const offset = (k % 2 === 0 ? -1 : 1) * (width / 2);
    points.push({ x: center.x + offset, y: center.y - height / 2 + height * t });
  }
  return points;
}

/** Chop a line into dash/gap pieces; a trailing partial dash is kept. */
export function dashSegment(from: Point, to: Point, dash: number, gap: number): Segment[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const stride = dash + gap;
  if (length === 0 || stride <= 0) return [];
  const ux = dx / length;
  const uy = dy / length;
  const segments: Segment[] = [];
  for (let start = 0; start < length; start += stride) {
    const end = Math.min(start + dash, length);
    segments.push({
      x1: from.x + ux * start,
      y1: from.y + uy * start,
      x2: from.x + ux * end,
      y2: from.y + uy * end,
    });
  }
  return segments;
}

export function dashedRectSegments(rect: Rect, dash: number, gap: number): Segment[] {
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.flatMap((corner, index) => dashSegment(corner, corners[(index + 1) % corners.length], dash, gap));
}

/** The cells a proposal newly occupies, per element — what the ghost outlines. */
export function proposalCells(proposal: StormProposal): Record<Element, Cell[]> {
  const strikes = proposal.lightning?.strikes ?? [];
  const newest = strikes.length > 0 ? [strikes[strikes.length - 1]] : [];
  return {
    lightning: newest,
    wind: proposal.wind?.pos ? [proposal.wind.pos] : [],
    water: proposal.water?.front ?? [],
  };
}

function strokeSegments(g: PIXI.Graphics, segments: Segment[]): void {
  for (const segment of segments) {
    g.moveTo(segment.x1, segment.y1);
    g.lineTo(segment.x2, segment.y2);
  }
}

function strokePolyline(g: PIXI.Graphics, points: Point[]): void {
  if (points.length < 2) return;
  g.moveTo(points[0].x, points[0].y);
  for (let k = 1; k < points.length; k++) g.lineTo(points[k].x, points[k].y);
}

export function drawGrid(g: PIXI.Graphics, grid: CoarseGrid): void {
  g.lineStyle({ width: 1, color: GRID_LINE_COLOR, alpha: GRID_LINE_ALPHA, alignment: 0.5 });
  strokeSegments(g, gridLineSegments(grid));
  g.lineStyle(0);
}

export function drawCells(g: PIXI.Graphics, cells: Record<CellKey, CellState>, grid: CoarseGrid): void {
  for (const [key, state] of Object.entries(cells)) {
    const cell = parseCellKey(key);
    if (!containsCell(cell, grid)) continue;
    const rect = cellRect(cell, grid);
    const color = CELL_COLORS[state];
    g.lineStyle({ width: 3, color, alpha: state === 0 ? 0.5 : 0.8, alignment: 0 });
    g.beginFill(color, CELL_ALPHAS[state]);
    g.drawRect(rect.x, rect.y, rect.width, rect.height);
    g.endFill();
  }
  g.lineStyle(0);
}

function drawLightning(g: PIXI.Graphics, strikes: Cell[], grid: CoarseGrid): void {
  const size = cellSizePx(grid);
  const alphas = fadeRamp(strikes.length, 0.2, 1);
  strikes.forEach((cell, index) => {
    const center = cellCenter(cell, grid);
    const alpha = alphas[index];
    g.beginFill(ELEMENT_COLORS.lightning, alpha * 0.25);
    g.drawCircle(center.x, center.y, size * 0.3);
    g.endFill();
    g.lineStyle({ width: size * 0.06, color: ELEMENT_COLORS.lightning, alpha });
    strokePolyline(g, boltPoints(center, size * 0.55, size * 0.22));
    g.lineStyle(0);
  });
}

function drawWind(g: PIXI.Graphics, trail: Cell[], pos: Cell | null, grid: CoarseGrid): void {
  const size = cellSizePx(grid);
  const points = cellPolyline(trail, grid);
  const alphas = fadeRamp(Math.max(points.length - 1, 0), 0.15, 0.6);
  for (let k = 1; k < points.length; k++) {
    g.lineStyle({ width: size * 0.12, color: ELEMENT_COLORS.wind, alpha: alphas[k - 1] });
    g.moveTo(points[k - 1].x, points[k - 1].y);
    g.lineTo(points[k].x, points[k].y);
  }
  if (pos) {
    const center = cellCenter(pos, grid);
    g.lineStyle({ width: size * 0.07, color: ELEMENT_COLORS.wind, alpha: 0.9 });
    strokePolyline(g, spiralPoints(center, size * 0.38));
  }
  g.lineStyle(0);
}

function drawWater(g: PIXI.Graphics, front: Cell[], grid: CoarseGrid): void {
  const size = cellSizePx(grid);
  const visible = front.filter((cell) => containsCell(cell, grid));
  g.lineStyle(0);
  g.beginFill(ELEMENT_COLORS.water, 0.35);
  for (const cell of visible) {
    const rect = cellRect(cell, grid);
    g.drawRect(rect.x, rect.y, rect.width, rect.height);
  }
  g.endFill();
  g.lineStyle({ width: size * 0.22, color: ELEMENT_COLORS.water, alpha: 0.55 });
  strokePolyline(g, cellPolyline(visible, grid));
  g.lineStyle(0);
}

export function drawStorm(g: PIXI.Graphics, storm: StormState, grid: CoarseGrid): void {
  if (!storm.lightning.destroyed) drawLightning(g, storm.lightning.strikes, grid);
  if (!storm.wind.destroyed) drawWind(g, storm.wind.trail, storm.wind.pos, grid);
  if (!storm.water.destroyed) drawWater(g, storm.water.front, grid);
}

export function drawProposal(g: PIXI.Graphics, proposal: StormProposal, grid: CoarseGrid): void {
  const size = cellSizePx(grid);
  const cellsByElement = proposalCells(proposal);
  for (const [element, cells] of Object.entries(cellsByElement) as [Element, Cell[]][]) {
    g.lineStyle({ width: size * 0.05, color: ELEMENT_COLORS[element], alpha: GHOST_ALPHA, alignment: 0 });
    for (const cell of cells) {
      if (!containsCell(cell, grid)) continue;
      strokeSegments(g, dashedRectSegments(cellRect(cell, grid), size * 0.16, size * 0.1));
    }
  }
  g.lineStyle(0);
}

/* -------------------------------------------- */
/*  Landmark labels                             */
/* -------------------------------------------- */

/** Font size in *screen* pixels; the counter-scale below keeps it there at any zoom. */
export const LABEL_FONT_PX = 15;
const LABEL_PAD_X = 10;
const LABEL_PAD_Y = 5;
const LABEL_GAP = 8;
const LABEL_BACKGROUND = 0x14161c;
const PIP_RADIUS = LABEL_FONT_PX * 0.26;
const PIP_SPACING = PIP_RADIUS * 2.8;

/** Scene notes read "A5. Skunk River Bridge"; a map label wants just the name. */
export function stripNoteIndex(text: string): string {
  return text.replace(/^A\d+\.\s*/, '');
}

/** Damage state from the landmark tracker: untouched is safe, at or past durability is destroyed. */
export function landmarkDamage(hits: number, durability: number): CellState {
  if (hits <= 0) return CELL_STATES.safe;
  if (hits >= durability) return CELL_STATES.destroyed;
  return CELL_STATES.damaged;
}

/**
 * Labels live in scene space but must hold a constant on-screen size, so each one scales by the
 * inverse of the stage zoom. Clamped so a deep zoom-out does not turn them into billboards.
 */
export function labelScale(stageScale: number, min = 0.5, max = 5): number {
  if (!Number.isFinite(stageScale) || stageScale <= 0) return 1;
  return Math.min(Math.max(1 / stageScale, min), max);
}

/** Pip x-offsets centred on zero, left to right. */
export function pipOffsets(count: number, spacing = PIP_SPACING): number[] {
  if (count <= 0) return [];
  const span = (count - 1) * spacing;
  return Array.from({ length: count }, (_, k) => -span / 2 + k * spacing);
}

function labelColors(state: CellState): { fill: number; alpha: number; border: number } {
  if (state === CELL_STATES.safe) return { fill: LABEL_BACKGROUND, alpha: 0.72, border: 0xffffff };
  return { fill: CELL_COLORS[state], alpha: Math.max(CELL_ALPHAS[state], 0.7), border: CELL_COLORS[state] };
}

/**
 * One landmark marker: a pill behind the name, with a pip per point of durability — filled for
 * damage taken, hollow for what is left.
 */
export function landmarkLabel(name: string, hits: number, durability: number): PIXI.Container {
  const state = landmarkDamage(hits, durability);
  const { fill, alpha, border } = labelColors(state);

  const container = new PIXI.Container();
  container.eventMode = 'none';

  const text = new PIXI.Text(name, {
    fontFamily: 'Signika, sans-serif',
    fontSize: LABEL_FONT_PX,
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: 2,
  });
  text.anchor.set(0, 0.5);
  text.resolution = 2;

  const offsets = pipOffsets(durability);
  const pipsWidth = offsets.length > 0 ? offsets[offsets.length - 1] - offsets[0] + PIP_RADIUS * 2 : 0;
  const contentWidth = text.width + (pipsWidth > 0 ? LABEL_GAP + pipsWidth : 0);
  const width = contentWidth + LABEL_PAD_X * 2;
  const height = Math.max(text.height, PIP_RADIUS * 2) + LABEL_PAD_Y * 2;

  const pill = new PIXI.Graphics();
  pill.lineStyle({ width: 1.5, color: border, alpha: 0.9, alignment: 0.5 });
  pill.beginFill(fill, alpha);
  pill.drawRoundedRect(-width / 2, -height / 2, width, height, height / 2);
  pill.endFill();

  text.position.set(-contentWidth / 2, 0);

  const pipCenter = -contentWidth / 2 + text.width + LABEL_GAP + pipsWidth / 2;
  const pips = new PIXI.Graphics();
  offsets.forEach((offset, index) => {
    const filled = index < hits;
    pips.lineStyle({ width: 1, color: 0xffffff, alpha: 0.9 });
    pips.beginFill(0xffffff, filled ? 0.95 : 0);
    pips.drawCircle(pipCenter + offset, 0, PIP_RADIUS);
    pips.endFill();
  });
  pips.lineStyle(0);

  container.addChild(pill, text, pips);
  return container;
}
