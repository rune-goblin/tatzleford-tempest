import type { SceneControl } from 'foundry-pf2e/foundry/client/applications/ui/scene-controls.mjs';
import { CONTROL_GROUP, CONTROL_TOOLS, MODULE_ID } from '../constants';
import type { ModuleApi } from '../types';

/**
 * The module's scene-control group, returned from `TempestLayer.prepareSceneControls()`. Core
 * calls that static for every module-registered `InteractionLayer` before firing
 * `getSceneControlButtons`, so the hook is not used here (plan Section 2a).
 */

/** Routed through the public api so the layer never imports console code. */
function openConsole(): void {
  const api = (game.modules.get(MODULE_ID) as { api?: ModuleApi } | undefined)?.api;
  if (!api?.openConsole) {
    console.warn(`${MODULE_ID} | the console is not registered yet`);
    return;
  }
  api.openConsole();
}

export function tempestSceneControl(activateLayer: () => void): SceneControl | null {
  if (!game.user.isGM) return null;

  return {
    name: CONTROL_GROUP,
    order: 99,
    title: `${MODULE_ID}.controls.group`,
    icon: 'fa-solid fa-cloud-bolt',
    visible: true,
    activeTool: CONTROL_TOOLS.paint,
    onChange: (_event, active) => {
      if (active) activateLayer();
    },
    tools: {
      [CONTROL_TOOLS.paint]: {
        name: CONTROL_TOOLS.paint,
        order: 1,
        title: `${MODULE_ID}.controls.paint.name`,
        icon: 'fa-solid fa-fill-drip',
      },
      [CONTROL_TOOLS.damage]: {
        name: CONTROL_TOOLS.damage,
        order: 2,
        title: `${MODULE_ID}.controls.damage.name`,
        icon: 'fa-solid fa-house-crack',
      },
      [CONTROL_TOOLS.console]: {
        name: CONTROL_TOOLS.console,
        order: 3,
        title: `${MODULE_ID}.controls.console.name`,
        icon: 'fa-solid fa-sliders',
        button: true,
        onChange: () => openConsole(),
      },
    },
  };
}
