<script>
  import { ui } from '../lib/app.svelte.js';
  import { friends } from '../lib/friends.svelte.js';
  import { wk } from './week.svelte.js';

  const t = $derived(ui.t);
  // The live feed carries the current week's board; ignore a stale one around midnight on Sunday.
  const board = $derived(friends.week?.week === wk.view?.week ? friends.week : null);
  const what = p => (p.solved ? t('solved', { n: p.tries }) : p.tries ? `${t('playing', { n: p.tries })} · ${t('weekProgress', { n: p.progress })}` : t('idle'));
</script>

{#if board && board.rows.length > 1}
  <section class="weekboard">
    <h3 class="subtitle">{t('weekBoard')}</h3>
    <ol class="ranks">
      {#each board.rows as p, i (p.pub)}
        <li class="rank" class:solved={p.solved} class:me={p.pub === friends.myPub}>
          <span class="pos">{p.solved ? i + 1 : '–'}</span>
          <span class="who">{p.name || '?'}{#if p.pub === friends.myPub}<small>{t('you')}</small>{/if}</span>
          <span class="what">{what(p)}{#if p.pad}<span class="tag">{t('padMark')}</span>{/if}</span>
        </li>
      {/each}
    </ol>
  </section>
{/if}
