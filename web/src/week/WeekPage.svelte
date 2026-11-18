<script>
  import { onMount } from 'svelte';
  import Header from '../Header.svelte';
  import FriendsDialog from '../FriendsDialog.svelte';
  import WeekVault from './WeekVault.svelte';
  import WeekLog from './WeekLog.svelte';
  import WeekBoard from './WeekBoard.svelte';
  import Clues from './Clues.svelte';
  import Heist from './Heist.svelte';
  import WeekHelp from './WeekHelp.svelte';
  import WeekStats from './WeekStats.svelte';
  import WeekNotes from './WeekNotes.svelte';
  import { load } from '../lib/storage.js';
  import { ui } from '../lib/app.svelte.js';
  import { startFriends } from '../lib/friends.svelte.js';
  import { wk, refs, loadWeek, fillFrom, submit, isChar } from './week.svelte.js';

  let friendsDlg, help, stats;
  startFriends({ padUsed: () => false });
  onMount(() => {
    loadWeek();
    if (!load('numly-week-seen', false)) help.show();
  });

  const t = $derived(ui.t);
  const spec = $derived(wk.view?.spec);
  const weekNo = $derived(wk.view ? String(Number(wk.view.week.split('-W')[1])) : '');
  const modText = m => t(`mod_${m}_d`, { sum: spec.sum ?? spec.sums?.join(' · '), per: spec.perDay }) + (m === 'sum' && spec.base === 16 ? ' (A=10 … F=15)' : '');

  // Type straight away without clicking a cell first.
  function onKeydown(e) {
    if (e.target !== document.body || !wk.view || wk.view.solved || e.metaKey || e.ctrlKey || document.querySelector('dialog[open]')) return;
    if (e.key.length === 1 && isChar(e.key)) {
      e.preventDefault();
      const firstEmpty = wk.digits.findIndex(d => !d);
      fillFrom(firstEmpty < 0 ? spec.len - 1 : firstEmpty, e.key);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }
</script>

<svelte:document onkeydown={onKeydown} />

<main>
  <Header
    meta={t('weekMeta', { w: weekNo })}
    nav={{ href: '/', label: t('dailyBtn') }}
    onFriends={() => friendsDlg.show()}
    onHelp={() => help.show()}
    onStats={() => stats.show()}
  />

  {#if !wk.view}
    <p id="msg" role="status">{wk.error ? t('offline') : t('loading')}</p>
  {:else}
    <section class="weekcard">
      <h2>{t(`type_${spec.type}`)}</h2>
      <p>{t(`type_${spec.type}_d`, { len: spec.len })} {t('perDay', { per: spec.perDay })}</p>
      {#if spec.mods.length}
        <ul class="mods">
          {#each spec.mods as m (m)}<li><b>{t(`mod_${m}`)}</b> {modText(m)}</li>{/each}
        </ul>
      {/if}
    </section>

    {#if spec.clues}<Clues clues={spec.clues} len={spec.len} />{/if}
    {#if wk.view.heist}<Heist />{/if}
    <WeekVault {weekNo} />
    <p id="msg" role="status">{wk.msg}</p>
    {#if !wk.view.solved}
      <p class="limits">
        <span class:out={wk.view.todayLeft === 0}>{t('todayLeft', { n: wk.view.todayLeft })}</span>
      </p>
    {/if}
    {#if spec.type !== 'grid'}<WeekNotes />{/if}
    <WeekLog />
    <WeekBoard />

    <section class="lastweek">
      <h3 class="subtitle">{t('lastWeek')}</h3>
      <p><code>{wk.view.last.code}</code> · {[t(`type_${wk.view.last.spec.type}`), ...wk.view.last.spec.mods.map(m => t(`mod_${m}`))].join(' · ')}</p>
    </section>
  {/if}
</main>

<FriendsDialog bind:this={friendsDlg} />
<WeekHelp bind:this={help} />
<WeekStats bind:this={stats} />
<canvas id="fx" bind:this={refs.fx}></canvas>
