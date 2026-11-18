<script>
  import { streakNow } from '../../../shared/logic.js';
  import { ui } from '../lib/app.svelte.js';
  import { game, today, won } from './game.svelte.js';

  let dialog;
  export const show = () => dialog.showModal();
  const t = $derived(ui.t);

  const BUCKETS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11+'];
  const max = $derived(Math.max(1, ...BUCKETS.map(k => game.stats.hist[k] || 0)));
  const todays = $derived(won() ? (game.guesses.length > 10 ? '11+' : String(game.guesses.length)) : null);
</script>

<dialog id="stats" bind:this={dialog}>
  <h2>{t('statsTitle')}</h2>
  <div class="tiles">
    <div><b>{game.stats.won}</b><span>{t('sWon')}</span></div>
    <div><b>{streakNow(game.stats, today)}</b><span>{t('sStreak')}</span></div>
    <div><b>{game.stats.best}</b><span>{t('sBest')}</span></div>
  </div>
  <div class="hist">
    {#each BUCKETS as k (k)}
      {@const v = game.stats.hist[k] || 0}
      <div class="bar" class:today={k === todays}><span>{k}</span><i style:width="{(v / max) * 100}%">{v}</i></div>
    {/each}
  </div>
  <form method="dialog"><button class="btn gold wide">{t('close')}</button></form>
</dialog>
