<script lang="ts">
  import type { TemplateKind } from '../../../services/templates';
  import { t } from '../i18n';
  import { consoleState } from '../state.svelte';

  const KINDS: TemplateKind[] = ['thunderclap', 'rendingDeluge', 'queensLightning'];
</script>

<section>
  <h3>{t('console.templates.heading')}</h3>

  <div class="row">
    {#each KINDS as kind (kind)}
      <button
        type="button"
        class:armed={consoleState.armed?.kind === kind}
        onclick={() => consoleState.place(kind)}
      >
        {t(`console.templates.${kind}`)}
      </button>
    {/each}
  </div>

  {#if consoleState.armed}
    <p class="hint">
      <span>
        {consoleState.armed.phase === 'aim' ? t('console.templates.aim') : t('console.templates.armed')}
      </span>
      <button type="button" onclick={() => consoleState.cancelPlacement()}>
        {t('console.templates.cancel')}
      </button>
    </p>
  {/if}
</section>

<style>
  .row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .armed {
    outline: 2px solid var(--tatzleford-tempest-accent, #6b21a8);
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85em;
    opacity: 0.85;
    margin: 0.4rem 0 0;
  }
</style>
