<script lang="ts">
  import type { Cell } from '../../../types';
  import { t } from '../i18n';
  import type { ElementRow } from '../rows';

  let { row, ontoggle }: { row: ElementRow; ontoggle: () => void } = $props();

  function describe(cell: Cell | null): string {
    return cell
      ? t('console.elements.position', { cell: `${cell.i},${cell.j}` })
      : t('console.elements.noPosition');
  }
</script>

<div class="element" class:destroyed={row.destroyed}>
  <div class="identity">
    <strong>{t(`element.${row.element}.name`)}</strong>
    <span class="routine">{t(`element.${row.element}.routine`)}</span>
  </div>

  <div class="position">
    <span>{describe(row.position)}</span>
    {#if row.proposed}
      <span class="proposed">&rarr; {describe(row.proposed)}</span>
    {/if}
  </div>

  <div class="actions">
    {#if row.down}
      <span class="down" title={t('console.elements.downIndicator')}>
        <i class="fa-solid fa-heart-crack" aria-hidden="true"></i>
        <span class="sr-only">{t('console.elements.downIndicator')}</span>
      </span>
    {/if}
    <span class="badge">{row.destroyed ? t('console.elements.destroyed') : t('console.elements.alive')}</span>
    <button type="button" onclick={ontoggle}>
      {row.destroyed ? t('console.elements.markActive') : t('console.elements.markDestroyed')}
    </button>
  </div>
</div>

<style>
  .element {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.25rem 0.5rem;
    align-items: center;
    padding: 0.35rem 0;
    border-bottom: 1px solid var(--color-border-light-tertiary, #7772);
  }
  .element.destroyed .identity {
    opacity: 0.55;
    text-decoration: line-through;
  }
  .identity {
    display: flex;
    flex-direction: column;
  }
  .routine,
  .position {
    font-size: 0.85em;
    opacity: 0.8;
  }
  .position {
    grid-column: 1;
  }
  .proposed {
    margin-left: 0.35rem;
    font-style: italic;
  }
  .actions {
    grid-column: 2;
    grid-row: 1 / span 2;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .badge {
    font-size: 0.75em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .down {
    color: #c0392b;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
