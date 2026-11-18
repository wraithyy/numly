<script>
  import { ui } from './lib/app.svelte.js';
  import { friends, setName, accept, reject, cancel, unfriend, friendLink } from './lib/friends.svelte.js';

  let dialog;
  let nameInput = $state();
  let editing = $state(false);
  let draft = $state(friends.name);
  let linkLabel = $state(null);

  export function show() {
    friends.notice = null;
    dialog.showModal();
  }

  // A friend link arrived: open right away so the player sees what happens with it.
  $effect(() => {
    if (friends.open && dialog && !dialog.open) {
      friends.open = false;
      dialog.showModal();
    }
  });

  const t = $derived(ui.t);
  const ready = $derived(Boolean(friends.name) && !editing);
  const note = $derived(friends.notice ? t(friends.notice.key, friends.notice.vars) : t(ready ? 'friendsIntro' : 'nameIntro'));
  const liveLabel = $derived(t({ on: 'live', connecting: 'connecting', off: 'offlineTag' }[friends.status]));

  function saveName(e) {
    e.preventDefault();
    if (!setName(draft)) return nameInput.focus();
    editing = false;
  }

  function rename() {
    editing = true;
    friends.notice = null;
    draft = friends.name;
    queueMicrotask(() => nameInput?.focus());
  }

  async function shareLink() {
    const url = friendLink();
    const text = t('friendLinkText');
    try {
      if (navigator.share) await navigator.share({ title: 'Numly', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        linkLabel = t('inviteCopied');
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Share failed:', err);
    }
  }

  const what = p => (p.solved ? t('solved', { n: p.tries }) : p.tries ? t('playing', { n: p.tries }) : t('idle'));
</script>

<dialog id="friends" class="friendsdlg" bind:this={dialog}>
  <div class="teambar">
    <h2>{t('friendsTitle')}</h2>
    {#if friends.name}<span class="live {friends.status}" id="live">{liveLabel}</span>{/if}
  </div>
  <p class="note" class:ok={friends.notice?.ok} id="friendsNote">{note}</p>

  {#if !ready}
    <form class="nameform" id="nameForm" onsubmit={saveName}>
      <input id="nameInput" bind:this={nameInput} bind:value={draft} maxlength="20" autocomplete="nickname" enterkeyhint="done" placeholder={t('namePh')} aria-label={t('namePh')} />
      <button class="btn gold" id="nameBtn">{t(editing ? 'saveName' : 'proceed')}</button>
    </form>
  {:else}
    <div id="friendsBody">
      {#if friends.incoming.length}
        <h3 class="subtitle">{t('requestsTitle')}</h3>
        <ul class="reqs" id="incoming">
          {#each friends.incoming as p (p.pub)}
            <li class="req in">
              <span class="who">{p.name || '?'}</span>
              <button type="button" class="btn sm gold" onclick={() => accept(p.pub)}>{t('accept')}</button>
              <button type="button" class="btn sm" onclick={() => reject(p.pub)}>{t('reject')}</button>
            </li>
          {/each}
        </ul>
      {/if}

      {#key friends.rev}
      <ol class="ranks" id="friendRanks">
        {#each friends.rows as p, i (p.pub)}
          {@const isMe = p.pub === friends.myPub}
          <li class="rank has-x" class:solved={p.solved} class:me={isMe} class:flash={friends.changed.has(p.pub)}>
            <span class="pos">{p.solved ? i + 1 : '–'}</span>
            <span class="who">{p.name || '?'}{#if isMe}<small>{t('you')}</small>{/if}</span>
            <span class="what">{what(p)}{#if p.pad}<span class="tag">{t('padMark')}</span>{/if}</span>
            {#if isMe}<span></span>{:else}
              <button type="button" class="x" aria-label={t('remove', { name: p.name })} onclick={() => unfriend(p.pub)}>×</button>
            {/if}
          </li>
        {/each}
        {#if friends.rows.length < 2}<li class="empty">{t('noFriends')}</li>{/if}
      </ol>
      {/key}

      {#if friends.outgoing.length}
        <h3 class="subtitle">{t('pendingTitle')}</h3>
        <ul class="reqs" id="outgoing">
          {#each friends.outgoing as p (p.pub)}
            <li class="req">
              <span class="who">{p.name || '?'}</span>
              <button type="button" class="btn sm" onclick={() => cancel(p.pub)}>{t('cancel')}</button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="teamactions">
        <button class="btn gold" id="friendLinkBtn" onclick={shareLink}>{linkLabel ?? t('myLink')}</button>
        <button class="linkbtn" id="renameBtn" onclick={rename}>{t('rename')}</button>
      </div>
    </div>
  {/if}
  <form method="dialog"><button class="btn wide">{t('close')}</button></form>
</dialog>
