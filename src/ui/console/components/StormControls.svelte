<script lang="ts">
  import { t } from '../i18n';
  import { consoleState } from '../state.svelte';
  import NudgePad from './NudgePad.svelte';
</script>

<section>
  <h3>{t('console.storm.heading')}</h3>

  <div class="row">
    <button type="button" onclick={() => consoleState.propose()} disabled={consoleState.busy}>
      {t('console.storm.propose')}
    </button>
    <button type="button" onclick={() => consoleState.discard()} disabled={!consoleState.proposal}>
      {t('console.storm.discard')}
    </button>
    <button
      type="button"
      class="commit"
      onclick={() => void consoleState.commit()}
      disabled={!consoleState.proposal || consoleState.busy}
    >
      {t('console.storm.commit')}
    </button>
  </div>

  {#if consoleState.proposal}
    <p class="hint">{t('console.storm.proposalHint')}</p>
    {#each consoleState.elements as row (row.element)}
      <div class="element-controls">
        <span class="name">{t(`element.${row.element}.name`)}</span>
        {#if row.destroyed}
          <span class="no-advance">{t('console.storm.noAdvance')}</span>
        {:else}
          <button type="button" onclick={() => consoleState.reroll(row.element)}>
            {t('console.storm.reroll')}
          </button>
          <NudgePad onnudge={(di, dj) => consoleState.nudge(row.element, di, dj)} />
        {/if}
      </div>
    {/each}
  {:else}
    <p class="hint">{t('console.storm.noProposal')}</p>
  {/if}
</section>

<style>
  .row {
    display: flex;
    gap: 0.35rem;
  }
  .element-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0;
  }
  .name {
    flex: 1;
  }
  .no-advance {
    font-size: 0.85em;
    opacity: 0.75;
  }
  .hint {
    font-size: 0.85em;
    opacity: 0.75;
    margin: 0.4rem 0 0;
  }
</style>
