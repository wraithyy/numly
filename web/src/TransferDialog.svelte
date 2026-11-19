<script>
  import { formatCode } from '../../shared/transfer.js';
  import { player, ui } from './lib/app.svelte.js';
  import { transfer, createCode, claim, localWins, applyProfile, backups, restoreBackup } from './lib/transfer.svelte.js';

  let dialog;
  const t = $derived(ui.t);

  let made = $state(null); // { code, until } shown on the old device
  let error = $state('');
  let busy = $state(false);
  let pending = $state(null); // a claimed profile, shown for confirmation before it replaces this one
  let linkLabel = $state(null);
  let saved = $state([]); // profiles earlier transfers replaced here

  $effect(() => {
    if (transfer.open && dialog && !dialog.open) {
      transfer.open = false;
      error = '';
      pending = null;
      saved = backups();
      dialog.showModal();
    }
  });

  async function run(fn) {
    busy = true;
    error = '';
    try {
      await fn();
    } catch (err) {
      console.error('Profile transfer failed:', err);
      error = t(['trBad', 'trLimited'].includes(err.message) ? err.message : 'offline');
    } finally {
      busy = false;
    }
  }

  const make = () => run(async () => {
    const { code, expires } = await createCode(player);
    made = { code: formatCode(code), until: new Date(expires).toLocaleTimeString(ui.lang, { hour: '2-digit', minute: '2-digit' }) };
    linkLabel = null;
  });

  async function copyLink() {
    const url = `${location.origin}/#transfer=${made.code}`;
    try {
      await navigator.clipboard.writeText(url);
      linkLabel = t('inviteCopied');
    } catch (err) {
      console.error('Clipboard write failed:', err);
      linkLabel = url;
    }
  }

  const take = e => {
    e.preventDefault();
    run(async () => {
      pending = await claim(transfer.code);
    });
  };
</script>

<dialog class="transferdlg" bind:this={dialog}>
  <h2>{t('trTitle')}</h2>

  {#if pending}
    <p class="trwho"><b>{pending.name || '?'}</b> · {t('trWins', { n: pending.wins })}</p>
    <p class="note">{localWins() > 0 ? t('trReplace', { n: localWins() }) : t('trTakeNote')}</p>
    <div class="ask">
      <button type="button" class="btn" onclick={() => (pending = null)}>{t('cancel')}</button>
      <button type="button" class="btn gold" onclick={() => run(async () => applyProfile(pending))}>{t('trReplaceBtn')}</button>
    </div>
  {:else}
    <h3 class="subtitle">{t('trOldHead')}</h3>
    {#if made}
      <p class="trcode" aria-live="polite">{made.code}</p>
      <p class="note">{t('trValid', { t: made.until })}</p>
      <button type="button" class="linkbtn" onclick={copyLink}>{linkLabel ?? t('trCopyLink')}</button>
    {:else}
      <p class="note">{t('trOldText')}</p>
      <button type="button" class="btn gold" disabled={busy} onclick={make}>{t('trCreate')}</button>
    {/if}

    <h3 class="subtitle">{t('trNewHead')}</h3>
    <form class="nameform" onsubmit={take}>
      <input id="trInput" bind:value={transfer.code} maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" aria-label={t('trNewHead')} />
      <button class="btn gold" disabled={busy}>{t('trGo')}</button>
    </form>
    {#if saved.length}
      <button type="button" class="linkbtn trrestore" disabled={busy} onclick={() => run(async () => restoreBackup(saved[0].key))}>
        {t('trRestore', { t: new Date(saved[0].at).toLocaleString(ui.lang, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
      </button>
    {/if}
  {/if}
  {#if error}<p class="note bad" role="alert">{error}</p>{/if}
  <form method="dialog"><button class="btn wide">{t('close')}</button></form>
</dialog>
