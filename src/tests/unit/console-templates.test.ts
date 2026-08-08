import { describe, expect, it } from 'vitest';
import { aimDirection, needsAim, templateData } from '@/services/templates';

const origin = { x: 1000, y: 1000 };

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
