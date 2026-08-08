import { describe, expect, it } from 'vitest';
import { mulberry32, nextSeed, pick, randomInt, weightedPick } from '@/services/storm/rng';

const draws = (seed: number, count: number) => {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => rng());
};

describe('mulberry32', () => {
  it('replays identically from the same seed', () => {
    expect(draws(12345, 20)).toEqual(draws(12345, 20));
  });

  it('diverges on a different seed', () => {
    expect(draws(12345, 20)).not.toEqual(draws(12346, 20));
  });

  it('stays inside [0, 1)', () => {
    for (const value of draws(99, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('exposes a state that resumes the same stream', () => {
    const first = mulberry32(7);
    const consumed = Array.from({ length: 5 }, () => first());
    const resumed = mulberry32(first.seed);

    expect(consumed).toHaveLength(5);
    expect(Array.from({ length: 5 }, () => resumed())).toEqual(draws(7, 10).slice(5));
  });

  it('advances one state step per draw', () => {
    const rng = mulberry32(0);
    rng();
    expect(rng.seed).toBe(nextSeed(0));
  });

  it('keeps the state an unsigned 32-bit integer across the wrap', () => {
    const rng = mulberry32(0xfffffff0);
    for (let n = 0; n < 10; n++) rng();
    expect(Number.isInteger(rng.seed)).toBe(true);
    expect(rng.seed).toBeGreaterThanOrEqual(0);
    expect(rng.seed).toBeLessThan(2 ** 32);
  });
});

describe('randomInt', () => {
  it('covers both ends inclusively and never leaves the range', () => {
    const rng = mulberry32(4);
    const seen = new Set<number>();
    for (let n = 0; n < 500; n++) {
      const value = randomInt(rng, -1, 1);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([-1, 0, 1]);
  });

  it('collapses to the single value of an empty range', () => {
    expect(randomInt(mulberry32(1), 3, 3)).toBe(3);
  });
});

describe('pick', () => {
  it('returns a member and eventually reaches every one', () => {
    const rng = mulberry32(11);
    const items = ['a', 'b', 'c'];
    const seen = new Set(Array.from({ length: 200 }, () => pick(rng, items)));
    expect([...seen].sort()).toEqual(items);
  });
});

describe('weightedPick', () => {
  it('honours the 60/20/20 vortex turn weights', () => {
    const rng = mulberry32(2024);
    const counts = { straight: 0, left: 0, right: 0 };
    for (let n = 0; n < 20000; n++) counts[weightedPick(rng, { straight: 0.6, left: 0.2, right: 0.2 })]++;

    expect(counts.straight / 20000).toBeCloseTo(0.6, 1);
    expect(counts.left / 20000).toBeCloseTo(0.2, 1);
    expect(counts.right / 20000).toBeCloseTo(0.2, 1);
  });

  it('never returns a zero-weight key', () => {
    const rng = mulberry32(5);
    for (let n = 0; n < 500; n++) expect(weightedPick(rng, { yes: 1, no: 0 })).toBe('yes');
  });
});
