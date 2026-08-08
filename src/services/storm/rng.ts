import type { Rng } from '../../types';

/**
 * mulberry32. The state advances by a fixed increment per draw, so `seed` after n draws is
 * `seed + n × INCREMENT` (mod 2³²) — that successor is what a proposal persists, which is why a
 * given seed always replays the same storm.
 */
const INCREMENT = 0x6d2b79f5;

export interface SeededRng extends Rng {
  /** The current internal state — the seed a later run resumes from. */
  readonly seed: number;
}

export function mulberry32(seed: number): SeededRng {
  let state = seed >>> 0;
  const draw = (): number => {
    state = (state + INCREMENT) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.defineProperty(draw, 'seed', { get: () => state }) as SeededRng;
}

/** The state one draw on. Guarantees progress even for a run that drew nothing. */
export function nextSeed(seed: number): number {
  return ((seed >>> 0) + INCREMENT) >>> 0;
}

/** Inclusive at both ends. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Picks a key with probability proportional to its weight, in insertion order. */
export function weightedPick<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}
