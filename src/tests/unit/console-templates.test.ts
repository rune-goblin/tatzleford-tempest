import { describe, expect, it } from 'vitest';
import { cellRect, coarseGrid } from '@/services/grid';
import { aimDirection, cellTemplateData, needsAim, templateData } from '@/services/templates';

const origin = { x: 1000, y: 1000 };

/** 33-px squares of 5 ft, 12 to a cell: a 396-px, 60-ft district. The scene clips column 2 and row 1. */
const grid = coarseGrid({ width: 1000, height: 700, grid: { size: 33 } }, 12);
const scale = { feetPerPixel: 5 / 33, squarePx: 33 };
const fill = (kind: 'thunderclap' | 'rendingDeluge' | 'queensLightning', i: number, j: number) =>
  cellTemplateData(kind, cellRect({ i, j }, grid), scale);

describe('aimDirection', () => {
  it('measures degrees clockwise from east', () => {
    expect(aimDirection(origin, { x: 1100, y: 1000 })).toBe(0);
    expect(aimDirection(origin, { x: 1000, y: 1100 })).toBe(90);
    expect(aimDirection(origin, { x: 900, y: 1000 })).toBe(180);
    expect(aimDirection(origin, { x: 1000, y: 900 })).toBe(270);
  });

  it('never returns a negative angle', () => {
    expect(aimDirection(origin, { x: 1100, y: 900 })).toBe(315);
  });
});

describe('needsAim', () => {
  it('is true only for the cone', () => {
    expect(needsAim('rendingDeluge')).toBe(true);
    expect(needsAim('thunderclap')).toBe(false);
    expect(needsAim('queensLightning')).toBe(false);
  });
});

describe('templateData', () => {
  it('builds the Thunderclap as a 30-ft-radius PF2e burst', () => {
    expect(templateData('thunderclap', origin)).toEqual({
      t: 'circle',
      x: 1000,
      y: 1000,
      distance: 30,
      direction: 0,
      flags: { pf2e: { areaShape: 'burst' } },
    });
  });

  it('builds the Rending Deluge as a 90° cone aimed at the second click', () => {
    expect(templateData('rendingDeluge', origin, { x: 1000, y: 1100 })).toEqual({
      t: 'cone',
      x: 1000,
      y: 1000,
      distance: 30,
      direction: 90,
      angle: 90,
      flags: { pf2e: { areaShape: 'cone' } },
    });
  });

  it('builds the Queen’s Lightning as a 5-ft strike marker', () => {
    const data = templateData('queensLightning', origin);
    expect(data.distance).toBe(5);
    expect(data.angle).toBeUndefined();
  });
});

describe('cellTemplateData on a full cell', () => {
  it('centres the Thunderclap burst and lands on its printed 30-ft radius', () => {
    expect(fill('thunderclap', 0, 0)).toEqual({
      t: 'circle',
      x: 198,
      y: 198,
      distance: 30,
      direction: 0,
      flags: { pf2e: { areaShape: 'burst' } },
    });
  });

  it('gives the Queen’s Lightning the same district-wide circle, not its 5-ft marker', () => {
    const data = fill('queensLightning', 1, 0);
    expect(data).toMatchObject({ t: 'circle', x: 594, y: 198, distance: 30 });
  });

  it('starts the Rending Deluge on the cell edge and spans the whole cell', () => {
    expect(fill('rendingDeluge', 1, 0)).toEqual({
      t: 'cone',
      x: 396,
      y: 198,
      distance: 60,
      direction: 0,
      angle: 90,
      flags: { pf2e: { areaShape: 'cone' } },
    });
  });

  it('derives feet from the scene rather than assuming 5 ft a square', () => {
    const coarse = coarseGrid({ width: 2400, height: 2400, grid: { size: 100 } }, 12);
    const data = cellTemplateData('thunderclap', cellRect({ i: 0, j: 0 }, coarse), {
      feetPerPixel: 10 / 100,
      squarePx: 100,
    });
    expect(data).toMatchObject({ x: 600, y: 600, distance: 60 });
  });
});

describe('cellTemplateData on a clipped edge cell', () => {
  it('keeps the burst inside the clipped rect and shrinks it once both axes are cut', () => {
    // Column 2 is 208 px wide, so the centre moves in and the radius still follows the long axis.
    expect(fill('thunderclap', 2, 0)).toMatchObject({ x: 891, y: 198, distance: 30 });
    // The corner cell is 208 × 304, and the burst shrinks with it.
    expect(fill('thunderclap', 2, 1)).toMatchObject({ x: 891, y: 561, distance: 23 });
  });

  it('turns the cone down the longer axis when the cell is clipped narrow', () => {
    expect(fill('rendingDeluge', 2, 0)).toEqual({
      t: 'cone',
      x: 891,
      y: 0,
      distance: 60,
      direction: 90,
      angle: 90,
      flags: { pf2e: { areaShape: 'cone' } },
    });
    expect(fill('rendingDeluge', 2, 1)).toMatchObject({ x: 891, y: 396, distance: 46, direction: 90 });
  });
});
