<script>
  import { LEN, archiveDays, dayNumber, streakNow } from '../../../shared/logic.js';
  import { ui } from '../lib/app.svelte.js';
  import { load } from '../lib/storage.js';
  import { transfer } from '../lib/transfer.svelte.js';
  import { game, today, day, archived, won } from './game.svelte.js';

  let dialog, days = $state([]);
  export const show = () => {
    days = archiveDays(today).map(d => ({ d, ...dayState(d) })); // fresh on every open: other tabs may have played
    dialog.showModal();
  };
  const t = $derived(ui.t);

  const BUCKETS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11+'];
  const max = $derived(Math.max(1, ...BUCKETS.map(k => game.stats.hist[k] || 0)));
  const todays = $derived(!archived && won() ? (game.guesses.length > 10 ? '11+' : String(game.guesses.length)) : null);

  function dayState(d) {
    const { guesses, hits } = load(`numly2-${d}`, { guesses: [], hits: {} });
    const solved = guesses.length > 0 && hits[guesses.at(-1)] === LEN;
    return { solved, tries: guesses.length };
  }
  const date = d => new Date(d).toLocaleDateString(ui.lang, { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
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
  <p class="tierlegend" title={t('tiers')}>
    <span><i class="pink"></i>≤10</span><span><i class="gold"></i>11–14</span><span><i class="purple"></i>15–20</span><span><i class="blue"></i>21+</span><span><i class="silver"></i>{t('pad').toLowerCase()}</span>
  </p>

  <h3 class="subtitle">{t('archiveTitle')}</h3>
  <p class="note">{days.length ? t('archiveNote') : t('archiveEmpty')}</p>
  {#if days.length}
    <ul class="archive">
      {#each days as a (a.d)}
        <li class:solved={a.solved} class:current={a.d === day}>
          <a href="/?day={a.d}"><b>#{String(dayNumber(a.d)).padStart(3, '0')}</b> <span>{date(a.d)}</span>
            <em>{a.solved ? `${t('arcSolved')} · ${a.tries}` : a.tries ? `${t('arcPlaying')} · ${a.tries}` : t('arcNone')}</em></a>
        </li>
      {/each}
    </ul>
  {/if}
  <button type="button" class="linkbtn transferlink" onclick={() => (transfer.open = true)}>{t('trOpen')}</button>
  <form method="dialog"><button class="btn gold wide">{t('close')}</button></form>
</dialog>
