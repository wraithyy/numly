<script>
  import { ui } from '../lib/app.svelte.js';
  import { wk, setGuess, safeLetter } from './week.svelte.js';

  const len = $derived(wk.view.spec.len);
  const rows = $derived(wk.view.tries.map((x, i) => ({ ...x, i })).reverse());
  const best = $derived(Math.max(0, ...wk.view.tries.filter(x => !x.solved).map(x => x.hits)));
</script>

<ol class="log week">
  {#each rows as r (r.i)}
    <li class:new={wk.newest && r.i === wk.view.tries.length - 1}>
      <button type="button" class="row {r.solved || r.opened ? 'win' : r.hits === best && best > 0 ? 'best' : ''}" aria-label={ui.t('row', { g: r.guess, s: r.hits })} onclick={() => setGuess(r.guess)}>
        <span class="n">{#if r.safe !== undefined}{safeLetter(r.safe)}·{/if}#{String(r.i + 1).padStart(2, '0')}</span>
        {#if r.rows}
          <span class="g mini">{#each r.guess.match(/.{5}/g) as line, k (k)}<span>{line}</span>{/each}</span>
          <span class="pins">{#each r.rows as n, k (k)}<span class="pin tall">{n}</span>{/each}</span>
        {:else}
          <span class="g">{r.guess}</span>
          <span class="pins">{#each { length: len } as _, k (k)}<span class="pin" class:on={k < r.hits}></span>{/each}</span>
        {/if}
        <span class="k">{r.hits}/{len}{#if r.near !== undefined}<small>+{r.near}</small>{/if}</span>
      </button>
    </li>
  {/each}
</ol>
