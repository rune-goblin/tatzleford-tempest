import { MODULE_ID } from '../../constants';
import type { ModuleApi } from '../../types';
import { TempestConsoleApp } from './TempestConsoleApp';

/**
 * Console seam. Attaches `openConsole` to the public api, so the layer's console button and the
 * pack macro both reach the window through `game.modules.get(MODULE_ID).api` and no other module
 * imports `src/ui/`.
 */
export function registerConsoleApi(api: ModuleApi): void {
  api.openConsole = () => {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.notifications.gmOnly`));
      return;
    }
    TempestConsoleApp.open();
  };
}
