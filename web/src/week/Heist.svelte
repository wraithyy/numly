<script>
  import { ui } from '../lib/app.svelte.js';
  import { wk, safeLetter } from './week.svelte.js';

  const t = $derived(ui.t);
  const spec = $derived(wk.view.spec);
  const current = $derived(wk.view.heist.current);
  const openedCodes = $derived(wk.view.tries.filter(x => x.opened).map(x => x.guess));
</script>

<section class="heist">
  <ol class="chain">
    {#each { length: spec.safes } as _, i (i)}
      <li class:done={i < current} class:now={i === current}>
        <b>{safeLetter(i)}</b>
        <span>{openedCodes[i] ?? (i === current ? '?'.repeat(spec.len) : '····')}</span>
        {#if spec.sums}<small>Σ {spec.sums[i]}</small>{/if}
      </li>
    {/each}
  </ol>
  {#if wk.view.heist.links.length}
    <h3 class="subtitle">{t('heistLinks')}</h3>
    <ul class="links">
      {#each wk.view.heist.links as { at, from }, i (i)}
        <li>{t('heistLink', { n: at + 1, b: safeLetter(i + 1), m: from + 1, a: safeLetter(i) })}</li>
      {/each}
    </ul>
  {/if}
</section>
