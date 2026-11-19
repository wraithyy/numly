<script>
  import { ui } from '../lib/app.svelte.js';
  import { setGuess } from './week.svelte.js';

  let { clues, len, total } = $props();
</script>

<section class="clues">
  <h3 class="subtitle">{ui.t('cluesTitle')}</h3>
  <ol>
    {#each clues as [guess, hits], i (i)}
      <li>
        <button type="button" class="row" aria-label={ui.t('row', { g: guess, s: hits })} onclick={() => setGuess(guess)}>
          <span class="g">{guess}</span>
          <span class="pins">{#each { length: len } as _, k (k)}<span class="pin" class:on={k < hits}></span>{/each}</span>
          <span class="k">{hits}/{len}</span>
        </button>
      </li>
    {/each}
  </ol>
  {#if clues.length < total}<p class="legend">{ui.t('cluesMore', { n: clues.length, total })}</p>{/if}
</section>
