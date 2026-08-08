import './styles.css';
import { openJournalOnImport, promptAdventureImport } from './adventure';
import { GM_GUIDE_ID, MODULE_ID } from './constants';
import { registerLayer, toggleLayer } from './layer/register';
import { commitAdvance, onActorUpdate, onSceneUpdate, proposeAdvance } from './services/storm/controller';
import { runHazardTurn } from './services/storm/hazard-turn';
import { registerSettings } from './settings';
import type { ModuleApi } from './types';
import { registerConsoleApi } from './ui/console/register';

Hooks.once('init', () => {
  registerSettings();
  registerLayer();
  openJournalOnImport(GM_GUIDE_ID);
});

Hooks.once('ready', () => {
  const module = game.modules.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';

  // `openConsole` is absent until registerConsoleApi attaches it — the console owns that seam.
  const activeScene = (): Scene | null => {
    if (canvas.scene) return canvas.scene;
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.notifications.noScene`));
    return null;
  };

  const api = {
    version,
    toggleLayer,
    advanceStorm: async () => {
      const scene = activeScene();
      if (scene) await commitAdvance(scene, proposeAdvance(scene));
    },
    hazardTurn: async () => {
      const scene = activeScene();
      if (scene) await runHazardTurn(scene);
    },
  } as ModuleApi;
  registerConsoleApi(api);

  // `api` is the Foundry convention for a public API, but isn't a typed field on Module.
  if (module) (module as { api?: ModuleApi }).api = api;

  // Everything the encounter needs lives in the Adventure, so the module is inert until it lands.
  void promptAdventureImport();
});

Hooks.on('updateScene', (scene, changed) => onSceneUpdate(scene, changed));

Hooks.on('updateActor', (actor: Actor, changed: Record<string, unknown>) => onActorUpdate(actor, changed));
