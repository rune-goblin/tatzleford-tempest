import {
  DEFAULT_AUTO_ZONE_CARDS,
  DEFAULT_CELL_SQUARES,
  DEFAULT_LANDMARK_LABELS,
  DEFAULT_OVERLAY_OPACITY,
  DEFAULT_PLAYER_VISIBLE,
  DEFAULT_ZONE_HIDDEN_TOKENS,
  HOOKS,
  MAX_CELL_SQUARES,
  MIN_CELL_SQUARES,
  MODULE_ID,
  SETTINGS,
} from './constants';

type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS];

function announce(key: SettingKey): void {
  Hooks.callAll(HOOKS.settingChanged, key);
}

export function registerSettings(): void {
  game.settings.register(MODULE_ID, SETTINGS.defaultCellSquares, {
    name: `${MODULE_ID}.settings.defaultCellSquares.name`,
    hint: `${MODULE_ID}.settings.defaultCellSquares.hint`,
    scope: 'world',
    config: true,
    type: new foundry.data.fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      min: MIN_CELL_SQUARES,
      max: MAX_CELL_SQUARES,
      initial: DEFAULT_CELL_SQUARES,
    }),
    default: DEFAULT_CELL_SQUARES,
    onChange: () => announce(SETTINGS.defaultCellSquares),
  });

  game.settings.register(MODULE_ID, SETTINGS.playerVisible, {
    name: `${MODULE_ID}.settings.playerVisible.name`,
    hint: `${MODULE_ID}.settings.playerVisible.hint`,
    scope: 'world',
    config: true,
    type: Boolean,
    default: DEFAULT_PLAYER_VISIBLE,
    onChange: () => announce(SETTINGS.playerVisible),
  });

  game.settings.register(MODULE_ID, SETTINGS.landmarkLabels, {
    name: `${MODULE_ID}.settings.landmarkLabels.name`,
    hint: `${MODULE_ID}.settings.landmarkLabels.hint`,
    scope: 'world',
    config: true,
    type: Boolean,
    default: DEFAULT_LANDMARK_LABELS,
    onChange: () => announce(SETTINGS.landmarkLabels),
  });

  game.settings.register(MODULE_ID, SETTINGS.autoZoneCards, {
    name: `${MODULE_ID}.settings.autoZoneCards.name`,
    hint: `${MODULE_ID}.settings.autoZoneCards.hint`,
    scope: 'world',
    config: true,
    type: Boolean,
    default: DEFAULT_AUTO_ZONE_CARDS,
    onChange: () => announce(SETTINGS.autoZoneCards),
  });

  game.settings.register(MODULE_ID, SETTINGS.zoneHiddenTokens, {
    name: `${MODULE_ID}.settings.zoneHiddenTokens.name`,
    hint: `${MODULE_ID}.settings.zoneHiddenTokens.hint`,
    scope: 'world',
    config: true,
    type: Boolean,
    default: DEFAULT_ZONE_HIDDEN_TOKENS,
    onChange: () => announce(SETTINGS.zoneHiddenTokens),
  });

  game.settings.register(MODULE_ID, SETTINGS.overlayOpacity, {
    name: `${MODULE_ID}.settings.overlayOpacity.name`,
    hint: `${MODULE_ID}.settings.overlayOpacity.hint`,
    scope: 'client',
    config: true,
    type: new foundry.data.fields.AlphaField({ initial: DEFAULT_OVERLAY_OPACITY }),
    default: DEFAULT_OVERLAY_OPACITY,
    onChange: () => announce(SETTINGS.overlayOpacity),
  });
}

/** The cell size a freshly painted scene freezes into its state; existing scenes keep theirs. */
export function getDefaultCellSquares(): number {
  return game.settings.get(MODULE_ID, SETTINGS.defaultCellSquares) as number;
}

export function getPlayerVisible(): boolean {
  return game.settings.get(MODULE_ID, SETTINGS.playerVisible) as boolean;
}

export function getOverlayOpacity(): number {
  return game.settings.get(MODULE_ID, SETTINGS.overlayOpacity) as number;
}

/** With this off, a commit moves the zones silently and the console's manual button posts. */
export function getAutoZoneCards(): boolean {
  return game.settings.get(MODULE_ID, SETTINGS.autoZoneCards) as boolean;
}

/** Hidden tokens sit out the sweep unless the GM wants ambushers caught too. */
export function getZoneHiddenTokens(): boolean {
  return game.settings.get(MODULE_ID, SETTINGS.zoneHiddenTokens) as boolean;
}

/**
 * Landmark labels are player-facing map furniture, so they answer to their own setting rather
 * than `playerVisible`, which governs the GM's storm overlay.
 */
export function getLandmarkLabels(): boolean {
  return game.settings.get(MODULE_ID, SETTINGS.landmarkLabels) as boolean;
}

/** The overlay is hidden from players entirely when `playerVisible` is off. */
export function isOverlayVisible(): boolean {
  return game.user.isGM || getPlayerVisible();
}
