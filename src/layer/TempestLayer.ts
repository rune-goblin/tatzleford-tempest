import type { SceneControl } from 'foundry-pf2e/foundry/client/applications/ui/scene-controls.mjs';
import { CELL_STATES, CONTROL_TOOLS, DEFAULT_CELL_SQUARES, LANDMARKS, LAYER_NAME, MODULE_ID } from '../constants';
import { defaultTempestState } from '../data/TempestStateModel';
import type { SceneLike } from '../services/grid';
import { cellKey, cellsBetween, coarseGrid, containsCell, pointToCell } from '../services/grid';
import { readState, writeState } from '../services/storm/controller';
import { getDefaultCellSquares, getLandmarkLabels, getOverlayOpacity, isOverlayVisible } from '../settings';
import type { Cell, CellKey, CellState, CoarseGrid, Point, StateChanges, StormProposal, TempestSceneState } from '../types';
import { tempestSceneControl } from './controls';
import { drawCells, drawGrid, drawProposal, drawStorm, labelScale, landmarkLabel, stripNoteIndex } from './render';

const { InteractionLayer } = foundry.canvas.layers;

type DragMode = 'paint' | 'erase';

/** The stage mouse manager dispatches by looking its callbacks up at call time, so they can be wrapped. */
type StageCallbacks = Record<string, ((event: PIXI.FederatedEvent) => unknown) | undefined>;

function interactionPoint(event: PIXI.FederatedEvent, key: 'origin' | 'destination'): Point | null {
  const data = (event as unknown as { interactionData?: Record<string, unknown> }).interactionData;
  const point = data?.[key] as Point | undefined;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: point.x, y: point.y };
}

/** Where the pointer is now, falling back to where the gesture started. */
function dragPoint(event: PIXI.FederatedEvent): Point | null {
  return interactionPoint(event, 'destination') ?? interactionPoint(event, 'origin');
}

/**
 * `Scene#width`/`#height` are nullable and include padding; `dimensions` is neither, and the
 * coarse lattice anchors at scene (0,0).
 */
function sceneRect(scene: Scene | null): SceneLike {
  if (!scene) return { width: 0, height: 0, grid: { size: 0 } };
  const { sceneWidth, sceneHeight, size } = scene.dimensions;
  return { width: sceneWidth, height: sceneHeight, grid: { size } };
}

/** All interaction arrives via canvas.stage; the overlay must never swallow a token click. */
function inertContainer(): PIXI.Container {
  const container = new PIXI.Container();
  container.eventMode = 'none';
  return container;
}

function inertGraphics(): PIXI.Graphics {
  const graphics = new PIXI.Graphics();
  graphics.eventMode = 'none';
  return graphics;
}

/** The localized landmark name, or the note's own text with its "A5. " map index stripped. */
function landmarkName(id: string, note: string): string {
  const key = `${MODULE_ID}.landmarks.${id}`;
  const localized = game.i18n.localize(key);
  return localized === key ? stripNoteIndex(note) : localized;
}

export class TempestLayer extends InteractionLayer {
  // `name` must equal the CONFIG.Canvas.layers key: CanvasLayer.instance resolves canvas[name],
  // and activate() uses it as the SceneControls control id.
  static override get layerOptions() {
    return Object.assign(super.layerOptions, { name: LAYER_NAME, zIndex: 700 });
  }

  static override prepareSceneControls(): SceneControl | null {
    return tempestSceneControl(() => getTempestLayer()?.activate());
  }

  /** Logged once: a broken controller or flag would otherwise spam every redraw. */
  static #readFailed = false;

  /** The GM's storm overlay: one container so `playerVisible` and `overlayOpacity` apply once. */
  #overlay: PIXI.Container | null = null;
  #gridLines: PIXI.Graphics | null = null;
  #cellFills: PIXI.Graphics | null = null;
  #stormMarks: PIXI.Graphics | null = null;
  #ghosts: PIXI.Graphics | null = null;
  /** Player-facing landmark markers, deliberately outside `#overlay`. */
  #labels: PIXI.Container | null = null;

  #dragMode: DragMode | null = null;
  #dragOrigin: Point | null = null;
  #dragCells: Cell[] = [];
  /** Where the last right-down landed, so a right-drag erase knows its anchor. */
  #rightOrigin: Point | null = null;

  #proposal: StormProposal | null = null;

  #patched: { callbacks: StageCallbacks; original: StageCallbacks } | null = null;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  protected override async _draw(options: object): Promise<void> {
    await super._draw(options);
    this.interactiveChildren = false;
    this.#overlay = this.addChild(inertContainer());
    this.#gridLines = this.#overlay.addChild(inertGraphics());
    this.#cellFills = this.#overlay.addChild(inertGraphics());
    this.#stormMarks = this.#overlay.addChild(inertGraphics());
    this.#ghosts = this.#overlay.addChild(inertGraphics());
    this.#labels = this.addChild(inertContainer());
    this.refresh();
  }

  protected override async _tearDown(options: object): Promise<void> {
    this.#overlay = this.#labels = null;
    this.#gridLines = this.#cellFills = this.#stormMarks = this.#ghosts = null;
    this.#cancelDrag();
    this.#proposal = null;
    await super._tearDown(options);
  }

  /**
   * Rebuild every Graphics from committed state plus the in-flight drag. ~250 cells — cheap.
   * `HOOKS.stateChanged` carries the fresh state, which spares a second parse of the flag.
   */
  refresh(committed?: TempestSceneState): void {
    const scene = canvas.scene;
    if (!scene || !this.#overlay || !this.#gridLines || !this.#cellFills || !this.#stormMarks || !this.#ghosts) return;

    this.#overlay.visible = isOverlayVisible();
    this.#overlay.alpha = getOverlayOpacity();

    const state = committed ?? this.#state(scene);
    const grid = this.gridFor(state);

    this.#gridLines.clear();
    // The full lattice only while painting; otherwise the painted cells' own outlines carry it.
    if (this.active) drawGrid(this.#gridLines, grid);

    this.#cellFills.clear();
    drawCells(this.#cellFills, this.#previewCells(state), grid);

    this.#stormMarks.clear();
    drawStorm(this.#stormMarks, state.storm, grid);

    this.#ghosts.clear();
    if (this.#proposal && game.user.isGM) drawProposal(this.#ghosts, this.#proposal, grid);

    this.#drawLabels(scene, state);
  }

  /* -------------------------------------------- */
  /*  Landmark labels                             */
  /* -------------------------------------------- */

  /**
   * Joins `LANDMARKS` to the scene's own Note documents by label text — no coordinates are stored
   * in the module. A note the GM has renamed simply gets no label, and vice versa.
   */
  #drawLabels(scene: Scene, state: TempestSceneState): void {
    const labels = this.#labels;
    if (!labels) return;
    labels.visible = getLandmarkLabels();
    labels.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!labels.visible) return;

    for (const definition of LANDMARKS) {
      const note = scene.notes.find((candidate) => candidate.text === definition.note);
      if (!note) continue;
      const tracked = state.landmarks[definition.id];
      const durability = tracked?.durability ?? definition.durability;
      const hits = Math.min(tracked?.hits ?? 0, durability);
      const label = landmarkLabel(landmarkName(definition.id, definition.note), hits, durability);
      label.position.set(note.x, note.y);
      labels.addChild(label);
    }
    this.scaleLabels();
  }

  /** Called on every pan/zoom: only the transforms change, so nothing is rebuilt. */
  scaleLabels(): void {
    if (!this.#labels) return;
    const scale = labelScale(canvas.stage?.scale?.x ?? 1);
    for (const label of this.#labels.children) label.scale.set(scale);
  }

  /** The GM's ephemeral advance preview. Never persisted; a reload discards it. */
  setProposal(proposal: StormProposal | null): void {
    this.#proposal = proposal;
    this.refresh();
  }

  /**
   * A scene's cell size is frozen by its first paint. Until then the world setting rules, so a GM
   * can change the size and see the lattice follow.
   */
  gridFor(state: TempestSceneState): CoarseGrid {
    const painted = Object.keys(state.cells).length > 0;
    return coarseGrid(sceneRect(canvas.scene), painted ? state.cellSquares : getDefaultCellSquares());
  }

  #previewCells(state: TempestSceneState): Record<CellKey, CellState> {
    if (!this.#dragMode) return state.cells;
    const cells = { ...state.cells };
    for (const cell of this.#dragCells) {
      const key = cellKey(cell);
      if (this.#dragMode === 'erase') delete cells[key];
      else cells[key] ??= CELL_STATES.safe;
    }
    return cells;
  }

  /* -------------------------------------------- */
  /*  State access                                */
  /* -------------------------------------------- */

  #state(scene: Scene): TempestSceneState {
    try {
      return readState(scene);
    } catch (error) {
      // A malformed flag must not take the canvas down with it.
      if (!TempestLayer.#readFailed) {
        TempestLayer.#readFailed = true;
        console.error(`${MODULE_ID} | could not read scene state`, error);
      }
      return defaultTempestState(DEFAULT_CELL_SQUARES);
    }
  }

  async #write(scene: Scene, changes: StateChanges): Promise<void> {
    try {
      await writeState(scene, changes);
    } catch (error) {
      console.error(`${MODULE_ID} | could not write scene state`, error);
    }
    this.refresh();
  }

  /* -------------------------------------------- */
  /*  Tools                                       */
  /* -------------------------------------------- */

  #tool(): string | null {
    if (!game.user.isGM) return null;
    return game.activeTool;
  }

  #cellAt(point: Point | null): Cell | null {
    const scene = canvas.scene;
    if (!scene || !point) return null;
    const grid = this.gridFor(this.#state(scene));
    const cell = pointToCell(point, grid);
    return containsCell(cell, grid) ? cell : null;
  }

  async #paint(cells: Cell[], mode: DragMode): Promise<void> {
    const scene = canvas.scene;
    if (!scene || cells.length === 0) return;
    const state = this.#state(scene);
    const changes: StateChanges = {};
    for (const cell of cells) {
      const key = cellKey(cell);
      const painted = key in state.cells;
      if (mode === 'paint' && !painted) changes[`cells.${key}`] = CELL_STATES.safe;
      if (mode === 'erase' && painted) changes[`cells.-=${key}`] = null;
    }
    if (Object.keys(changes).length === 0) {
      this.refresh();
      return;
    }
    // First paint freezes the cell size: every stored key is meaningless under a different one.
    if (mode === 'paint' && Object.keys(state.cells).length === 0) changes.cellSquares = getDefaultCellSquares();
    await this.#write(scene, changes);
  }

  async #cycleDamage(cell: Cell, delta: 1 | -1): Promise<void> {
    const scene = canvas.scene;
    if (!scene) return;
    const state = this.#state(scene);
    const key = cellKey(cell);
    const current = state.cells[key];
    if (current === undefined) return;
    const next = current + delta;
    if (next < CELL_STATES.safe || next > CELL_STATES.destroyed) return;
    await this.#write(scene, { [`cells.${key}`]: next });
  }

  /* -------------------------------------------- */
  /*  Interaction                                 */
  /* -------------------------------------------- */

  protected override _onClickLeft(event: PIXI.FederatedEvent): void {
    const tool = this.#tool();
    const cell = this.#cellAt(interactionPoint(event, 'origin'));
    if (!cell) return;
    if (tool === CONTROL_TOOLS.paint) void this.#paint([cell], 'paint');
    else if (tool === CONTROL_TOOLS.damage) void this.#cycleDamage(cell, 1);
  }

  protected override _onClickRight(event: PIXI.FederatedEvent): void {
    const origin = interactionPoint(event, 'origin');
    const tool = this.#tool();
    // Right-down always precedes a right-drag, and no callback fires when the drag never starts,
    // so the click erases its own cell now and only records the origin a later drag extends from.
    this.#rightOrigin = tool === CONTROL_TOOLS.paint ? origin : null;
    const cell = this.#cellAt(origin);
    if (!cell) return;
    if (tool === CONTROL_TOOLS.damage) void this.#cycleDamage(cell, -1);
    else if (tool === CONTROL_TOOLS.paint) void this.#paint([cell], 'erase');
  }

  protected override _onDragLeftStart(event: PIXI.FederatedEvent): void {
    if (this.#tool() !== CONTROL_TOOLS.paint) return;
    this.#dragMode = 'paint';
    this.#dragOrigin = interactionPoint(event, 'origin');
    this.#dragCells = [];
  }

  protected override _onDragLeftMove(event: PIXI.FederatedEvent): void {
    this.#extendDrag(event);
  }

  protected override _onDragLeftDrop(event: PIXI.FederatedEvent): void {
    this.#extendDrag(event);
    void this.#commitDrag();
  }

  protected override _onDragLeftCancel(): void {
    this.#cancelDrag();
    this.refresh();
  }

  /** A drag spans the rectangle between its origin and the pointer, so it stays reversible mid-gesture. */
  #extendDrag(event: PIXI.FederatedEvent): void {
    const scene = canvas.scene;
    if (!scene || !this.#dragMode || !this.#dragOrigin) return;
    const to = dragPoint(event);
    if (!to) return;
    this.#dragCells = cellsBetween(this.#dragOrigin, to, this.gridFor(this.#state(scene)));
    this.refresh();
  }

  async #commitDrag(): Promise<void> {
    const mode = this.#dragMode;
    const cells = this.#dragCells;
    this.#cancelDrag();
    if (mode) await this.#paint(cells, mode);
    else this.refresh();
  }

  #cancelDrag(): void {
    this.#dragMode = null;
    this.#dragOrigin = null;
    this.#dragCells = [];
  }

  /** True once a right-drag with the paint tool owns the gesture; false leaves core to pan. */
  #beginEraseDrag(): boolean {
    if (this.#dragMode === 'erase') return true;
    if (this.#dragMode || !this.#rightOrigin || this.#tool() !== CONTROL_TOOLS.paint) return false;
    this.#dragMode = 'erase';
    this.#dragOrigin = this.#rightOrigin;
    this.#dragCells = [];
    return true;
  }

  /* -------------------------------------------- */
  /*  Activation                                  */
  /* -------------------------------------------- */

  protected override _activate(): void {
    this.#captureRightDrag();
    this.refresh();
  }

  protected override _deactivate(): void {
    this.#releaseRightDrag();
    this.#cancelDrag();
    this.refresh();
  }

  /**
   * Core routes right-drag straight to canvas panning and never offers it to the active layer, so
   * the spec'd right-drag erase has to borrow the stage manager's callbacks. Scoped to the time
   * this layer is active, and it defers to the original panning for every tool but paint.
   */
  #captureRightDrag(): void {
    if (this.#patched) return;
    const manager = canvas.mouseInteractionManager as unknown as { callbacks?: StageCallbacks } | undefined;
    const callbacks = manager?.callbacks;
    if (!callbacks) return;
    const original: StageCallbacks = {
      dragRightMove: callbacks.dragRightMove,
      dragRightDrop: callbacks.dragRightDrop,
      dragRightCancel: callbacks.dragRightCancel,
    };
    callbacks.dragRightMove = (event) => {
      if (!this.#beginEraseDrag()) return original.dragRightMove?.(event);
      this.#extendDrag(event);
      return undefined;
    };
    callbacks.dragRightDrop = (event) => {
      if (this.#dragMode !== 'erase') return original.dragRightDrop?.(event);
      this.#rightOrigin = null;
      void this.#commitDrag();
      return undefined;
    };
    callbacks.dragRightCancel = (event) => {
      if (this.#dragMode !== 'erase') return original.dragRightCancel?.(event);
      this.#rightOrigin = null;
      this.#cancelDrag();
      this.refresh();
      return undefined;
    };
    this.#patched = { callbacks, original };
  }

  #releaseRightDrag(): void {
    if (!this.#patched) return;
    Object.assign(this.#patched.callbacks, this.#patched.original);
    this.#patched = null;
  }
}

/** `canvas[LAYER_NAME]` is attached at runtime, so it is absent from the `Canvas` typedef. */
export function getTempestLayer(): TempestLayer | null {
  const layer = (canvas as unknown as Record<string, unknown> | undefined)?.[LAYER_NAME];
  return layer instanceof TempestLayer ? layer : null;
}
