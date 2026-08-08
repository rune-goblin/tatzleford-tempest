import { ELEMENT_ART, ELEMENTS, MODULE_ID } from '../constants';
import type { Element } from '../types';

const textures = new Map<Element, PIXI.Texture>();
let pending: Promise<void> | null = null;

/** The loaded texture, or `null` while it is still in flight or if the file could not be read. */
export function zoneTexture(element: Element): PIXI.Texture | null {
  const texture = textures.get(element);
  return texture?.baseTexture?.valid ? texture : null;
}

/**
 * Loads each zone image once and keeps the `PIXI.Texture` for every later redraw. Core expires its
 * own texture cache between scenes, so anything already valid costs nothing and anything it
 * destroyed is fetched again — but a redraw never loads, it only reads `zoneTexture`.
 */
export function loadZoneArt(): Promise<void> {
  if (pending) return pending;
  const missing = ELEMENTS.filter((element) => !zoneTexture(element));
  if (missing.length === 0) return Promise.resolve();
  pending = loadAll(missing);
  return pending;
}

async function loadAll(elements: Element[]): Promise<void> {
  try {
    await Promise.all(elements.map(load));
  } finally {
    pending = null;
  }
}

async function load(element: Element): Promise<void> {
  const src = ELEMENT_ART[element];
  try {
    const asset = await foundry.canvas.loadTexture(src);
    // A Spritesheet here would mean the wrong kind of file; either way the zone falls back to
    // the primitive marks rather than drawing nothing.
    if (asset instanceof PIXI.Texture) textures.set(element, asset);
    else console.warn(`${MODULE_ID} | no zone art at ${src}; drawing ${element} as outlines`);
  } catch (error) {
    console.error(`${MODULE_ID} | could not load zone art ${src}`, error);
  }
}
