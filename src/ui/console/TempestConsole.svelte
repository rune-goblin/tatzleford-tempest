<script lang="ts">
  import DistrictSummary from './components/DistrictSummary.svelte';
  import ElementRow from './components/ElementRow.svelte';
  import LandmarkTracker from './components/LandmarkTracker.svelte';
  import StormControls from './components/StormControls.svelte';
  import TemplateButtons from './components/TemplateButtons.svelte';
  import { t } from './i18n';
  import { consoleState } from './state.svelte';
</script>

<div class="tempest-console" class:busy={consoleState.busy}>
  <header>
    <span class="round">{t('console.round', { round: consoleState.round })}</span>
  </header>

  <section class="elements">
    <h3>{t('console.elements.heading')}</h3>
    {#each consoleState.elements as row (row.element)}
      <ElementRow {row} ontoggle={() => consoleState.setDestroyed(row.element, !row.destroyed)} />
    {/each}
  </section>

  <StormControls />
  <TemplateButtons />
  <DistrictSummary />
  <LandmarkTracker />
</div>

<style>
  .tempest-console {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem 0.75rem;
  }
  .tempest-console.busy {
    pointer-events: none;
    opacity: 0.7;
  }
  header {
    display: flex;
    justify-content: flex-end;
  }
  .round {
    font-variant: small-caps;
    letter-spacing: 0.05em;
    opacity: 0.85;
  }
  .tempest-console :global(h3) {
    margin: 0 0 0.25rem;
    font-size: 1em;
    border-bottom: 1px solid var(--color-border-light-primary, #7774);
  }
</style>
