<script lang="ts">
  import { t } from '../i18n';
  import { consoleState } from '../state.svelte';
</script>

<section>
  <h3>{t('console.cells.heading')}</h3>

  <ul class="tallies">
    <li>{t('console.cells.painted', { count: consoleState.counts.painted })}</li>
    <li class="damaged">{t('console.cells.damaged', { count: consoleState.counts.damaged })}</li>
    <li class="destroyed">{t('console.cells.destroyed', { count: consoleState.counts.destroyed })}</li>
  </ul>

  <p class="hint">
    {t('console.cells.cellSquares', { squares: consoleState.cellSquares, feet: consoleState.cellFeet })}
  </p>
  {#if consoleState.counts.painted > 0}
    <p class="hint">{t('console.cells.cellSquaresFrozen', { squares: consoleState.cellSquares })}</p>
  {/if}

  <div class="row">
    <button type="button" onclick={() => consoleState.rollRandom()}>{t('console.cells.rollRandom')}</button>
    {#if consoleState.rolled}
      <span class="rolled">{t('console.cells.rolled', { cell: consoleState.rolled })}</span>
    {/if}
  </div>
</section>

<style>
  .tallies {
    display: flex;
    gap: 0.75rem;
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.9em;
  }
  .damaged {
    color: #f2c14e;
  }
  .destroyed {
    color: #c0392b;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }
  .rolled {
    font-weight: bold;
  }
  .hint {
    font-size: 0.85em;
    opacity: 0.75;
    margin: 0.4rem 0 0;
  }
</style>
