import { DEFAULT_CELL_SQUARES, DIRECTION_VECTORS } from '../constants';
import type { Cell, CellKey, CellState, CoarseGrid, Dir8, Point, Rect } from '../types';

/**
 * Coarse district-grid arithmetic. Deliberately separate from `foundry.grid.SquareGrid`, which
 * serves the fine 33-px lattice: this one is our own, anchored at scene (0,0), with the last
 * column and row clipped to the scene rect wherever the cell size does not divide it evenly.
 *
 * Pure — no `foundry.*` references, so vitest runs it under plain Node.
 */

/** Anything with a scene rect and a fine grid; `Scene` satisfies it structurally. */
export interface SceneLike {
  width: number;
  height: number;
  grid: { size: number };
}

export function coarseGrid(scene: SceneLike, cellSquares = DEFAULT_CELL_SQUARES): CoarseGrid {
  return {
    sceneWidth: scene.width,
    sceneHeight: scene.height,
    squarePx: scene.grid.size,
    cellSquares,
  };
}

/** Nominal cell edge in pixels — 12 squares × 33 px = 396 px by default. */
export function cellSizePx(grid: CoarseGrid): number {
  return grid.squarePx * grid.cellSquares;
}

/** Columns and rows, counting the partial edge column and row. */
export function gridDimensions(grid: CoarseGrid): { columns: number; rows: number } {
  const size = cellSizePx(grid);
  return {
    columns: Math.ceil(grid.sceneWidth / size),
    rows: Math.ceil(grid.sceneHeight / size),
  };
}

export function cellKey(cell: Cell): CellKey {
  return `${cell.i},${cell.j}`;
}

export function parseCellKey(key: CellKey): Cell {
  const [i, j] = key.split(',');
  return { i: Number(i), j: Number(j) };
}

export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.i === b.i && a.j === b.j;
}

/** The cell containing a scene point. Indices may fall outside the grid — check `containsCell`. */
export function pointToCell(point: Point, grid: CoarseGrid): Cell {
  const size = cellSizePx(grid);
  return { i: Math.floor(point.x / size), j: Math.floor(point.y / size) };
}

export function containsCell(cell: Cell, grid: CoarseGrid): boolean {
  const { columns, rows } = gridDimensions(grid);
  return cell.i >= 0 && cell.j >= 0 && cell.i < columns && cell.j < rows;
}

export function clampCell(cell: Cell, grid: CoarseGrid): Cell {
  const { columns, rows } = gridDimensions(grid);
  return {
    i: Math.min(Math.max(cell.i, 0), columns - 1),
    j: Math.min(Math.max(cell.j, 0), rows - 1),
  };
}

/** The cell's pixel rect, clipped to the scene: edge cells come back narrower or shorter. */
export function cellRect(cell: Cell, grid: CoarseGrid): Rect {
  const size = cellSizePx(grid);
  const x = cell.i * size;
  const y = cell.j * size;
  return {
    x,
    y,
    width: Math.max(0, Math.min(size, grid.sceneWidth - x)),
    height: Math.max(0, Math.min(size, grid.sceneHeight - y)),
  };
}

/** Centre of the clipped rect, so markers on partial edge cells stay inside the map. */
export function cellCenter(cell: Cell, grid: CoarseGrid): Point {
  const rect = cellRect(cell, grid);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Every cell of the lattice, row-major. */
export function allCells(grid: CoarseGrid): Cell[] {
  const { columns, rows } = gridDimensions(grid);
  const cells: Cell[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) cells.push({ i, j });
  return cells;
}

/** The inclusive block of cells spanned by a drag, clamped to the grid. */
export function cellsBetween(from: Point, to: Point, grid: CoarseGrid): Cell[] {
  const a = clampCell(pointToCell(from, grid), grid);
  const b = clampCell(pointToCell(to, grid), grid);
  const cells: Cell[] = [];
  for (let j = Math.min(a.j, b.j); j <= Math.max(a.j, b.j); j++) {
    for (let i = Math.min(a.i, b.i); i <= Math.max(a.i, b.i); i++) cells.push({ i, j });
  }
  return cells;
}

/** Painted cells in key order, skipping keys that no longer parse to a cell inside the grid. */
export function paintedCells(cells: Record<CellKey, CellState>, grid?: CoarseGrid): Cell[] {
  const parsed = Object.keys(cells).map(parseCellKey);
  const valid = parsed.filter((cell) => Number.isInteger(cell.i) && Number.isInteger(cell.j));
  return grid ? valid.filter((cell) => containsCell(cell, grid)) : valid;
}

export function isPainted(cell: Cell, cells: Record<CellKey, CellState>): boolean {
  return cellKey(cell) in cells;
}

export function step(cell: Cell, heading: Dir8, distance = 1): Cell {
  const { di, dj } = DIRECTION_VECTORS[heading];
  return { i: cell.i + di * distance, j: cell.j + dj * distance };
}

/** Chebyshev distance in cells — a diagonal step costs the same as an orthogonal one. */
export function cellDistance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));
}
