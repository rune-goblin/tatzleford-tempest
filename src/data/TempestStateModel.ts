import {
  DEFAULT_CELL_SQUARES,
  DIRECTIONS,
  LANDMARKS,
  MAX_CELL_SQUARES,
  MIN_CELL_SQUARES,
} from '../constants';
import type { TempestSceneState } from '../types';

const fields = foundry.data.fields;

const cellIndexField = () =>
  new fields.NumberField<number, number, true, false, true>({
    required: true,
    nullable: false,
    integer: true,
    initial: 0,
  });

const cellSchema = () => ({ i: cellIndexField(), j: cellIndexField() });

const cellField = () => new fields.SchemaField(cellSchema());

const nullableCellField = () =>
  new fields.SchemaField(cellSchema(), { required: true, nullable: true, initial: null });

const cellListField = () => new fields.ArrayField(cellField(), { required: true, nullable: false, initial: [] });

const headingField = (initial: string) =>
  new fields.StringField({ required: true, nullable: false, choices: [...DIRECTIONS], initial });

/**
 * Read-time validation for `scene.flags['tatzleford-tempest'].state`. A thin wrapper only —
 * every decision lives in the pure modules under `src/services/`, which vitest can run without
 * the `foundry` global.
 */
export class TempestStateModel extends foundry.abstract.DataModel {
  static override defineSchema(): foundry.abstract.DataSchema {
    return {
      cellSquares: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        min: MIN_CELL_SQUARES,
        max: MAX_CELL_SQUARES,
        initial: DEFAULT_CELL_SQUARES,
      }),
      cells: new fields.TypedObjectField(
        new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max: 2, initial: 0 }),
      ),
      landmarks: new fields.TypedObjectField(
        new fields.SchemaField({
          hits: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          durability: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 3 }),
        }),
      ),
      storm: new fields.SchemaField({
        seed: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        round: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        rolledCell: new fields.StringField<string, string, true, true, true>({
          required: true,
          nullable: true,
          blank: false,
          initial: null,
        }),
        lightning: new fields.SchemaField({
          destroyed: new fields.BooleanField({ initial: false }),
          strikes: cellListField(),
        }),
        wind: new fields.SchemaField({
          destroyed: new fields.BooleanField({ initial: false }),
          pos: nullableCellField(),
          trail: cellListField(),
          heading: headingField('e'),
        }),
        water: new fields.SchemaField({
          destroyed: new fields.BooleanField({ initial: false }),
          front: cellListField(),
          heading: headingField('e'),
        }),
      }),
    };
  }
}

/** A blank state for a scene that has never been painted. */
export function defaultTempestState(cellSquares = DEFAULT_CELL_SQUARES, seed = Date.now() >>> 0): TempestSceneState {
  return {
    cellSquares,
    cells: {},
    landmarks: Object.fromEntries(LANDMARKS.map((l) => [l.id, { hits: 0, durability: l.durability }])),
    storm: {
      seed,
      round: 0,
      rolledCell: null,
      lightning: { destroyed: false, strikes: [] },
      wind: { destroyed: false, pos: null, trail: [], heading: 'e' },
      water: { destroyed: false, front: [], heading: 'e' },
    },
  };
}

/** Clean and validate raw flag data, filling defaults for anything missing or malformed. */
export function parseTempestState(source: unknown, cellSquares = DEFAULT_CELL_SQUARES): TempestSceneState {
  if (!source || typeof source !== 'object') return defaultTempestState(cellSquares);
  // A stored cellSquares always wins: it was frozen at first paint and the cell keys depend on it.
  const model = new TempestStateModel({ cellSquares, ...(source as object) }, { strict: false });
  return model.toObject() as unknown as TempestSceneState;
}
