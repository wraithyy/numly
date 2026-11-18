<script>
  import { ui } from '../lib/app.svelte.js';
  import { game, refs, pad, won, togglePad, setDigit } from './game.svelte.js';

  const t = $derived(ui.t);
  const p = $derived(pad());
  const state = (count, left) => (count === 0 ? 'no' : count === left ? 'sure' : '');
</script>

<section class="pad">
  <div class="padbar">
    <button class="toggle" id="padBtn" aria-pressed={game.padOn} onclick={togglePad}><span class="sw"></span><span>{t('pad')}</span></button>
    <span class="left" bind:this={refs.left}>{p ? `${p.left.toLocaleString(ui.lang)} ${t.codes(p.left)}` : ''}</span>
  </div>
  <p class="warn">{game.padUsed ? t('padOn') : won() ? '' : t('padOff')}</p>
  {#if p}
    <div>
      <p class="legend">{@html t('legend')}</p>
      <!-- one column per slot (aligned under the code cells), one row per digit -->
      <div class="padgrid" id="pad">
        {#each { length: 10 } as _, d (d)}
          {#each p.counts as slot, i (i)}
            {@const st = state(slot[d], p.left)}
            <button
              type="button"
              class="pc {st}"
              disabled={won()}
              aria-label={t('cell', { p: i + 1, d, st: t(st || 'maybe') })}
              onclick={() => setDigit(i, String(d))}>{d}</button>
          {/each}
        {/each}
      </div>
    </div>
  {/if}
</section>
