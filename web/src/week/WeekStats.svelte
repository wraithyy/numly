<script>
  import { ui } from '../lib/app.svelte.js';
  import { WEEK_BUCKETS, gameWeek, weekBucket, weekStreakNow } from '../../../shared/week.js';
  import { wk } from './week.svelte.js';

  let dialog;
  export const show = () => dialog.showModal();
  const t = $derived(ui.t);
  const max = $derived(Math.max(1, ...WEEK_BUCKETS.map(k => wk.stats.hist[k] || 0)));
  const current = $derived(wk.view?.solved ? weekBucket(wk.view.tries.length) : null);
</script>

<dialog id="weekStats" bind:this={dialog}>
  <h2>{t('weekStatsTitle')}</h2>
  <div class="tiles">
    <div><b>{wk.stats.won}</b><span>{t('sWeeks')}</span></div>
    <div><b>{weekStreakNow(wk.stats, gameWeek())}</b><span>{t('sStreak')}</span></div>
    <div><b>{wk.stats.best}</b><span>{t('sBest')}</span></div>
  </div>
  <div class="hist">
    {#each WEEK_BUCKETS as k (k)}
      {@const v = wk.stats.hist[k] || 0}
      <div class="bar" class:today={k === current}><span>{k}</span><i style:width="{(v / max) * 100}%">{v}</i></div>
    {/each}
  </div>
  <form method="dialog"><button class="btn gold wide">{t('close')}</button></form>
</dialog>
