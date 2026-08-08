<script lang="ts">
  import { DIRECTIONS, DIRECTION_VECTORS } from '../../../constants';
  import { t } from '../i18n';

  let { onnudge }: { onnudge: (di: number, dj: number) => void } = $props();

  /** The arrow glyph points north at 0°; the heading vector gives the rotation. */
  function rotation(di: number, dj: number): number {
    return (Math.atan2(di, -dj) * 180) / Math.PI;
  }
</script>

<div class="nudge-pad">
  {#each DIRECTIONS as direction (direction)}
    {@const vector = DIRECTION_VECTORS[direction]}
    {@const label = t('console.storm.nudge', { direction: t(`direction.${direction}`) })}
    <button
      type="button"
      style="grid-column: {vector.di + 2}; grid-row: {vector.dj + 2}"
      title={label}
      aria-label={label}
      onclick={() => onnudge(vector.di, vector.dj)}
    >
      <i
        class="fa-solid fa-arrow-up"
        style="transform: rotate({rotation(vector.di, vector.dj)}deg)"
        aria-hidden="true"
      ></i>
    </button>
  {/each}
</div>

<style>
  .nudge-pad {
    display: grid;
    grid-template-columns: repeat(3, 1.6rem);
    grid-template-rows: repeat(3, 1.6rem);
    gap: 2px;
  }
  button {
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    line-height: 1;
    font-size: 0.75em;
  }
</style>
