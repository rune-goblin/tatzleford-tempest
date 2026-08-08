<script lang="ts">
  import { t } from '../i18n';
  import { consoleState } from '../state.svelte';
</script>

<section>
  <h3>{t('console.landmarks.heading')}</h3>

  <ul>
    {#each consoleState.landmarks as landmark (landmark.id)}
      {@const ruined = landmark.hits >= landmark.durability}
      <li class:ruined>
        <span class="name">{t(`landmarks.${landmark.id}`)}</span>
        <span class="pips" aria-label={t('console.landmarks.hits', { hits: landmark.hits, durability: landmark.durability })}>
          {#each { length: landmark.durability }, pip}
            <span class="pip" class:hit={pip < landmark.hits}></span>
          {/each}
        </span>
        <span class="count">{ruined ? t('console.landmarks.ruined') : t('console.landmarks.hits', { hits: landmark.hits, durability: landmark.durability })}</span>
        <button
          type="button"
          title={t('console.landmarks.removeHit')}
          aria-label={t('console.landmarks.removeHit')}
          disabled={landmark.hits === 0}
          onclick={() => consoleState.recordHit(landmark.id, -1)}
        >
          <i class="fa-solid fa-minus" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          title={t('console.landmarks.addHit')}
          aria-label={t('console.landmarks.addHit')}
          disabled={ruined}
          onclick={() => consoleState.recordHit(landmark.id, 1)}
        >
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </li>
    {/each}
  </ul>

  <button type="button" onclick={() => consoleState.resetLandmarks()}>{t('console.landmarks.reset')}</button>
</section>

<style>
  ul {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: 1fr auto auto auto auto;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0;
    font-size: 0.9em;
  }
  li.ruined .name {
    opacity: 0.55;
    text-decoration: line-through;
  }
  .pips {
    display: flex;
    gap: 3px;
  }
  .pip {
    width: 0.6rem;
    height: 0.6rem;
    border: 1px solid currentcolor;
    border-radius: 50%;
    opacity: 0.5;
  }
  .pip.hit {
    background: #c0392b;
    opacity: 1;
  }
  .count {
    min-width: 4.5em;
    text-align: right;
    opacity: 0.8;
  }
  li button {
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    line-height: 1;
  }
</style>
