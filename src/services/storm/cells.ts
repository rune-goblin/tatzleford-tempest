import { cellDistance } from '../grid';
import type { Cell, Rng } from '../../types';
import { pick } from './rng';

/** The closest candidate cell, ties broken by the seeded stream so the choice stays replayable. */
export function nearestCell(from: Cell, candidates: Cell[], rng: Rng): Cell {
  const shortest = Math.min(...candidates.map((cell) => cellDistance(from, cell)));
  return pick(
    rng,
    candidates.filter((cell) => cellDistance(from, cell) === shortest),
  );
}
