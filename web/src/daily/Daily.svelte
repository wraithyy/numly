<script>
  import { onMount } from 'svelte';
  import Header from '../Header.svelte';
  import FriendsDialog from '../FriendsDialog.svelte';
  import Vault from './Vault.svelte';
  import Log from './Log.svelte';
  import HideCode from '../HideCode.svelte';
  import Notepad from './Notepad.svelte';
  import HelpDialog from './HelpDialog.svelte';
  import StatsDialog from './StatsDialog.svelte';
  import { LEN, streakNow } from '../../../shared/logic.js';
  import { ui } from '../lib/app.svelte.js';
  import { load } from '../lib/storage.js';
  import { gameWeek } from '../../../shared/week.js';
  import { weekDone } from '../week/week.svelte.js';
  import { startFriends, guessInfo, markPad } from '../lib/friends.svelte.js';
  import { game, refs, today, dayNo, archived, won, fillFrom, submit, connectFriends } from './game.svelte.js';

  let help, stats, friendsDlg;

  connectFriends({ guessInfo, markPad });
  // Friends only ever see today's game, also while replaying the archive.
  startFriends({ padUsed: () => (archived ? load(`numly-pad-used-${today}`, false) : game.padUsed) });

  // A status line in the previous language would look broken.
  $effect(() => {
    ui.lang;
    game.msg = '';
  });

  onMount(() => {
    if (!won()) refs.cells[0]?.focus();
    if (!load('numly-seen', false)) help.show();
  });

  // Allow playing from the keyboard without clicking a cell first.
  function onKeydown(e) {
    if (e.target !== document.body || won() || e.metaKey || e.ctrlKey || document.querySelector('dialog[open]')) return;
    const firstEmpty = game.digits.findIndex(d => !d);
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      fillFrom(firstEmpty < 0 ? LEN - 1 : firstEmpty, e.key);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }
</script>

<svelte:document onkeydown={onKeydown} />

<main>
  <Header
    meta={ui.t(archived ? 'archiveMeta' : 'meta', { d: dayNo })}
    streak={streakNow(game.stats, today)}
    nav={archived ? { href: '/', label: ui.t('backToday') } : { href: '/week', label: ui.t('weekBtn'), dot: !weekDone(gameWeek()) }}
    onFriends={() => friendsDlg.show()}
    onHelp={() => help.show()}
    onStats={() => stats.show()}
  />
  <Vault onStats={() => stats.show()} />
  <p id="msg" role="status">{game.msg}</p>
  {#if game.guesses.length && !won()}<div class="logbar"><HideCode /></div>{/if}
  <Log />
  <Notepad />
</main>

<HelpDialog bind:this={help} />
<FriendsDialog bind:this={friendsDlg} />
<StatsDialog bind:this={stats} />
<canvas id="fx" bind:this={refs.fx}></canvas>
