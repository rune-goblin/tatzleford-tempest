import { HOOKS, LAYER_NAME, MODULE_ID } from '../constants';
import type { StormProposal, TempestSceneState } from '../types';
import { getTempestLayer, TempestLayer } from './TempestLayer';

/**
 * Canvas-layer seam. Registers `CONFIG.Canvas.layers[LAYER_NAME]` and the redraw subscriptions.
 * Scene controls are declared by `TempestLayer.prepareSceneControls()`, which core invokes for
 * every module-registered `InteractionLayer` — the `getSceneControlButtons` hook is not used.
 */

let registered = false;

/** Called from `init`: `_createLayers()` runs at canvas-group construction, and later is too late. */
export function registerLayer(): void {
  if (registered) return;
  registered = true;

  // CONFIG.Canvas.layers is typed as a closed interface, so the module's own entry needs a cast.
  const layers = CONFIG.Canvas.layers as unknown as Record<string, { group: string; layerClass: unknown }>;
  layers[LAYER_NAME] = { group: 'interface', layerClass: TempestLayer };

  Hooks.on('canvasReady', () => getTempestLayer()?.refresh());
  Hooks.on(HOOKS.stateChanged, (scene: Scene, state: TempestSceneState) => {
    // The GM may edit a scene that is not the one being viewed.
    if (scene?.id !== canvas.scene?.id) return;
    getTempestLayer()?.refresh(state);
  });
  Hooks.on(HOOKS.elementDown, () => getTempestLayer()?.refresh());
  Hooks.on(HOOKS.settingChanged, () => getTempestLayer()?.refresh());
  // Ephemeral, GM-only: the console announces its preview and nothing is persisted.
  Hooks.on(HOOKS.proposalChanged, (proposal: StormProposal | null) => getTempestLayer()?.setProposal(proposal ?? null));
  // Labels hold a constant on-screen size, so every zoom step re-derives their counter-scale.
  Hooks.on('canvasPan', () => getTempestLayer()?.scaleLabels());
}

export function toggleLayer(): void {
  const layer = getTempestLayer();
  if (!layer) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.notifications.noScene`));
    return;
  }
  if (layer.active) canvas.tokens.activate();
  else layer.activate();
}
