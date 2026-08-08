import { ELEMENTS, FLAG_ELEMENT_KEY, FLAG_SCOPE, HOOKS, LANDMARKS, MODULE_ID, ROLLED_PAN_MS } from '../../constants';
import { cellCenter, parseCellKey } from '../../services/grid';
import {
  commitAdvance,
  nudgeProposal,
  previewZones,
  proposeAdvance,
  readState,
  rollSector,
  sceneGrid,
  setRolledCell,
  writeState,
} from '../../services/storm/controller';
import { runHazardTurn } from '../../services/storm/hazard-turn';
import { catchCounts, postZoneCards, type ZoneCatch } from '../../services/storm/zone-damage';
import { armTemplate, cancelTemplate, type ArmedTemplate, type TemplateKind } from '../../services/templates';
import type { CellKey, Element, StormProposal, TempestSceneState } from '../../types';
import { countCells, landmarkRows, positionOf, proposedPositionOf, type ElementRow } from './rows';

const noneDown = (): Record<Element, boolean> => ({ lightning: false, wind: false, water: false });

/** Which Tempest actors currently sit at 0 HP. Lights an indicator; the GM still marks destroyed. */
function downElements(): Record<Element, boolean> {
  const down = noneDown();
  for (const actor of game.actors?.contents ?? []) {
    const element = actor.getFlag(FLAG_SCOPE, FLAG_ELEMENT_KEY) as Element | undefined;
    if (!element || !ELEMENTS.includes(element)) continue;
    const hp = (actor as { system?: { attributes?: { hp?: { value?: number } } } }).system?.attributes?.hp?.value;
    if (typeof hp === 'number' && hp <= 0) down[element] = true;
  }
  return down;
}

class TempestConsoleState {
  scene = $state.raw<Scene | null>(null);
  committed = $state.raw<TempestSceneState | null>(null);
  /** Ephemeral and GM-client-only: players see nothing until `commit`. */
  proposal = $state.raw<StormProposal | null>(null);
  down = $state(noneDown());
  armed = $state.raw<ArmedTemplate | null>(null);
  busy = $state(false);
  /** What the ghost would catch. Preview only — it rolls nothing. */
  zonePreview = $state.raw<ZoneCatch[]>([]);
  /** Caught by the last commit but unposted, because auto-resolution is off. */
  pendingZones = $state.raw<ZoneCatch[]>([]);

  caught = $derived(catchCounts(this.zonePreview));
  pendingCount = $derived(this.pendingZones.reduce((total, zone) => total + zone.tokens.length, 0));
  counts = $derived(countCells(this.committed));
  landmarks = $derived(landmarkRows(this.committed));
  round = $derived(this.proposal?.round ?? this.committed?.storm.round ?? 0);
  /** Derived from committed state, so every change to it necessarily went through `writeState`. */
  rolled: CellKey | null = $derived(this.committed?.storm.rolledCell ?? null);
  cellSquares = $derived(this.committed?.cellSquares ?? 0);
  cellFeet = $derived(this.cellSquares * (this.scene?.grid.distance ?? 5));

  elements: ElementRow[] = $derived(
    ELEMENTS.map((element) => ({
      element,
      destroyed: this.committed?.storm[element].destroyed ?? false,
      down: this.down[element],
      position: positionOf(this.committed?.storm ?? null, element),
      proposed: proposedPositionOf(this.proposal, element),
    })),
  );

  /** Subscribes to the controller's fan-out hooks. Returns the unsubscriber for `_preClose`. */
  subscribe(): () => void {
    const subscriptions: [string, number][] = [
      [
        HOOKS.stateChanged,
        // The fan-out carries the validated state, so the console never re-reads the flag.
        Hooks.on(HOOKS.stateChanged, (scene: Scene, state: TempestSceneState) => {
          if (scene.id !== canvas.scene?.id) return;
          this.scene = scene;
          this.committed = state;
        }),
      ],
      [HOOKS.settingChanged, Hooks.on(HOOKS.settingChanged, () => this.refresh())],
      [
        HOOKS.elementDown,
        Hooks.on(HOOKS.elementDown, (element: Element) => {
          this.down[element] = true;
        }),
      ],
      // `elementDown` fires on the way down only; healing past 0 has to clear the indicator.
      [
        'updateActor',
        Hooks.on('updateActor', () => {
          this.down = downElements();
        }),
      ],
      // A scene swap invalidates both the cell keys and any proposal against them.
      [
        'canvasReady',
        Hooks.on('canvasReady', () => {
          this.setProposal(null);
          this.refresh();
        }),
      ],
    ];
    this.refresh();
    return () => {
      for (const [hook, id] of subscriptions) Hooks.off(hook, id);
    };
  }

  refresh(): void {
    const scene = canvas.scene ?? null;
    this.scene = scene;
    this.committed = scene ? this.read(scene) : null;
    this.down = downElements();
  }

  setDestroyed(element: Element, destroyed: boolean): void {
    void this.write({ [`storm.${element}.destroyed`]: destroyed });
  }

  /** The round's one button. Everything it persists goes through the controller's own writes. */
  async hazardTurn(): Promise<void> {
    const scene = this.requireScene();
    if (!scene || this.busy) return;
    this.busy = true;
    try {
      const turn = await runHazardTurn(scene);
      if (turn?.cell) this.focus(turn.cell);
    } catch (error) {
      this.report(error);
    } finally {
      this.busy = false;
    }
  }

  propose(): void {
    const scene = this.requireScene();
    if (!scene) return;
    this.setProposal(this.guard(() => proposeAdvance(scene), null));
  }

  reroll(element: Element): void {
    const scene = this.requireScene();
    if (!scene || !this.proposal) return;
    const previous = this.proposal;
    this.setProposal(this.guard(() => proposeAdvance(scene, previous, element), previous));
  }

  nudge(element: Element, di: number, dj: number): void {
    const previous = this.proposal;
    if (!previous) return;
    this.setProposal(this.guard(() => nudgeProposal(previous, element, di, dj), previous));
  }

  discard(): void {
    this.setProposal(null);
  }

  async commit(): Promise<void> {
    const scene = this.requireScene();
    const proposal = this.proposal;
    if (!scene || !proposal) return;
    this.busy = true;
    try {
      this.pendingZones = await commitAdvance(scene, proposal);
      this.setProposal(null);
      ui.notifications.info(game.i18n.format(`${MODULE_ID}.notifications.committed`, { round: proposal.round }));
    } catch (error) {
      this.report(error);
    } finally {
      this.busy = false;
    }
  }

  /** Posts the cards a silent commit held back. The GM still applies every point of damage. */
  async resolveZones(): Promise<void> {
    if (this.pendingZones.length === 0) return;
    const zones = this.pendingZones;
    this.busy = true;
    try {
      await postZoneCards(zones);
      this.pendingZones = [];
    } catch (error) {
      this.report(error);
    } finally {
      this.busy = false;
    }
  }

  async rollRandom(): Promise<void> {
    const scene = this.requireScene();
    if (!scene || this.busy) return;
    this.busy = true;
    try {
      const rolled = await rollSector(scene);
      if (rolled === null) ui.notifications.warn(localize('notifications.noPaintedCells'));
      else this.focus(rolled);
    } catch (error) {
      this.report(error);
    } finally {
      this.busy = false;
    }
  }

  async clearRolled(): Promise<void> {
    const scene = this.requireScene();
    if (!scene) return;
    try {
      await setRolledCell(scene, null);
    } catch (error) {
      this.report(error);
    }
  }

  /**
   * Pans the GM's own camera to the sector and pings it for everyone else. `pull` is forced off
   * so a held SHIFT cannot drag every player's viewport along with it.
   */
  private focus(cell: CellKey): void {
    const scene = this.scene;
    const state = this.committed;
    if (!scene || !state) return;
    const center = cellCenter(parseCellKey(cell), sceneGrid(scene, state));
    void canvas.animatePan({ x: center.x, y: center.y, duration: ROLLED_PAN_MS });
    // `style` and `pull` are read by Canvas#ping but missing from its typed options.
    const options = { style: CONFIG.Canvas.pings.types.ALERT, pull: false } as Parameters<typeof canvas.ping>[1];
    void canvas.ping(center, options);
  }

  recordHit(id: string, delta: number): void {
    const row = this.landmarks.find((landmark) => landmark.id === id);
    if (!row) return;
    const hits = Math.min(Math.max(row.hits + delta, 0), row.durability);
    if (hits === row.hits) return;
    // Writing durability too seeds the flag entry from `LANDMARKS` the first time a landmark is hit.
    void this.write({ [`landmarks.${id}.hits`]: hits, [`landmarks.${id}.durability`]: row.durability });
  }

  resetLandmarks(): void {
    const changes = Object.fromEntries(LANDMARKS.map((landmark) => [`landmarks.${landmark.id}.hits`, 0]));
    void this.write(changes);
  }

  place(kind: TemplateKind): void {
    armTemplate(kind, (armed) => {
      this.armed = armed;
    });
  }

  cancelPlacement(): void {
    cancelTemplate();
    this.armed = null;
  }

  /**
   * Every proposal change re-announces the ghost; `null` clears it on commit or discard. The hook
   * goes through `constants.ts` because the console must not import from `src/layer/`.
   */
  private setProposal(next: StormProposal | null): void {
    this.proposal = next;
    const scene = this.scene;
    this.zonePreview = next && scene ? this.guard(() => previewZones(scene, next), []) : [];
    Hooks.callAll(HOOKS.proposalChanged, next);
  }

  private requireScene(): Scene | null {
    if (this.scene) return this.scene;
    ui.notifications.warn(localize('notifications.noScene'));
    return null;
  }

  private read(scene: Scene): TempestSceneState | null {
    return this.guard(() => readState(scene), null);
  }

  private async write(changes: Record<string, unknown>): Promise<void> {
    const scene = this.requireScene();
    if (!scene) return;
    this.busy = true;
    try {
      await writeState(scene, changes);
    } catch (error) {
      this.report(error);
    } finally {
      this.busy = false;
    }
  }

  /** The controller is a seam: a failed call leaves the window standing rather than tearing it down. */
  private guard<T>(action: () => T, fallback: T): T {
    try {
      return action();
    } catch (error) {
      this.report(error);
      return fallback;
    }
  }

  private report(error: unknown): void {
    console.error(`${MODULE_ID} | console`, error);
  }
}

function localize(key: string): string {
  return game.i18n.localize(`${MODULE_ID}.${key}`);
}

export const consoleState = new TempestConsoleState();
