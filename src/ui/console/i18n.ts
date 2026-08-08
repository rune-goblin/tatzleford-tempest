import { MODULE_ID } from '../../constants';

/** Every console string lives under `tatzleford-tempest.*`; components pass the suffix. */
export function t(key: string, data?: Record<string, string | number>): string {
  const full = `${MODULE_ID}.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}
